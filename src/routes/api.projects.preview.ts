import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  streamText,
  tool,
  type UIMessage,
  validateUIMessages,
} from "ai";
import { z } from "zod";

import { getAiModel, getAiTelemetry } from "@/lib/ai";
import { getDefaultAiModel } from "@/lib/ai-models";
import { writeAiRequestLog } from "@/lib/ai-request-log";
import {
  DISCUSS_CARD_SEMANTIC_ATTEMPTS,
  DISCUSS_CARD_SERVER_DEADLINE_MS,
  getAiTimeoutMs,
} from "@/lib/ai-timeouts";
import { auth } from "@/lib/auth";
import { isBoundedJsonError, readBoundedJson } from "@/lib/bounded-json";
import { isDiscussOneCallToolsEnabled } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { getSafeAiErrorLog } from "@/lib/projects/ai-error-log";
import {
  mergeProjectBriefPatch,
  parseProjectBrief,
} from "@/lib/projects/brief";
import {
  normalizeWorkspaceTurn,
  parseWorkspaceCard,
} from "@/lib/projects/brief-flow";
import { validateBrief } from "@/lib/projects/brief-rich-fields";
import { maybeCompactProjectChat } from "@/lib/projects/chat-compaction";
import {
  buildProjectChatContext,
  dedupeUiMessages,
  getTextFromUIMessage,
  parseProjectChatMessages,
  parseProjectChatSummary,
  parseProjectMemoryFacts,
} from "@/lib/projects/chat-memory";
import { DISCUSS_SYSTEM_PROMPT } from "@/lib/projects/prompts/discuss-system";
import { stripTransportDiagnosticMessages } from "@/lib/projects/strip-transport-diagnostic-messages";
import { buildBriefPatchFromWorkspaceAnswers } from "@/lib/projects/workspace-answers";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  chargeEnergyForAiUsage,
  checkEnergy,
  isUserVerified,
  MIN_ENERGY_DISCUSS,
} from "@/lib/user-credits";

type PreviewRequest = {
  message?: UIMessage;
  messages?: UIMessage[];
  mode?: "discuss" | "build" | "repair_card";
  projectId?: string;
  workspaceAnswers?: unknown;
};

export const Route = createFileRoute("/api/projects/preview")({
  server: {
    handlers: {
      POST: ({ request }) => handlePreviewPost(request),
    },
  },
});

async function handlePreviewPost(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  const userId = session.user.id;

  const verified = await isUserVerified(userId);
  if (!verified) {
    return Response.json(
      {
        message: "Verifikasi nomor telepon diperlukan.",
        code: "verification_required",
      },
      { status: 403 },
    );
  }

  const rateLimitResponse = await checkRateLimit(request, "ai", userId);

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  let body: PreviewRequest;

  try {
    body = (await readBoundedJson(request, {
      maxBytes: 256 * 1024,
    })) as PreviewRequest;
  } catch (error) {
    if (isBoundedJsonError(error)) {
      return Response.json(
        {
          code: error.code,
          message:
            error.code === "request_body_too_large"
              ? "Pesan terlalu besar. Ringkas dulu sebelum dikirim."
              : "Format pesan belum valid.",
        },
        { status: error.code === "request_body_too_large" ? 413 : 400 },
      );
    }

    throw error;
  }

  if (!body.projectId) {
    return Response.json({ message: "Proyek tidak valid." }, { status: 400 });
  }

  if (body.mode !== "repair_card") {
    const energy = await checkEnergy(userId, MIN_ENERGY_DISCUSS);
    if (!energy.allowed) {
      return sseError({
        message: "Energi harian habis. Coba lagi besok.",
        code: "energy_exhausted",
        remaining: energy.remaining,
      });
    }
  }

  const project = await prisma.project.findFirst({
    where: { id: body.projectId, userId },
    select: { id: true, prompt: true, status: true, title: true },
  });

  if (!project) {
    return Response.json(
      { message: "Proyek tidak ditemukan." },
      { status: 404 },
    );
  }

  if (project.status === "building") {
    return Response.json(
      {
        message:
          "AI sedang membangun. Tunggu sampai selesai atau hentikan dulu.",
      },
      { status: 409 },
    );
  }

  const [chatRow] = await prisma.$queryRaw<
    [
      {
        brief: unknown;
        chatMessages: unknown;
        chatSummary: unknown;
        lastCompactedMessageCount: unknown;
        memoryFacts: unknown;
        workspaceCard: unknown;
      },
    ]
  >`
    SELECT "chatMessages", "chatSummary", "memoryFacts", "lastCompactedMessageCount", "brief", "workspaceCard" FROM "Project" WHERE id = ${project.id} AND "userId" = ${userId}
  `;
  const storedMessages = parseProjectChatMessages(chatRow?.chatMessages);
  const parsedChatSummary = parseProjectChatSummary(chatRow?.chatSummary);
  const chatSummary = {
    ...parsedChatSummary,
    compactedMessageCount: Math.max(
      parsedChatSummary.compactedMessageCount,
      typeof chatRow?.lastCompactedMessageCount === "number"
        ? chatRow.lastCompactedMessageCount
        : 0,
    ),
  };
  const memoryFacts = parseProjectMemoryFacts(chatRow?.memoryFacts);
  const incoming = body.message ? [body.message] : (body.messages ?? []);

  if (incoming.length > 1) {
    return Response.json(
      {
        code: "chat_turn_count_exceeded",
        message: "Kirim satu pesan baru dalam satu waktu, ya.",
      },
      { status: 400 },
    );
  }

  const incomingPartCount = incoming.reduce(
    (count, message) => count + message.parts.length,
    0,
  );
  const incomingBytes = Buffer.byteLength(JSON.stringify(incoming), "utf8");

  if (incomingPartCount > 32 || incomingBytes > 16 * 1024) {
    return Response.json(
      {
        code: "chat_turn_too_large",
        message: "Pesan terlalu panjang. Ringkas dulu sebelum dikirim.",
      },
      { status: 413 },
    );
  }

  const latestUserText = incoming
    .flatMap((message) => message.parts)
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ");
  const currentBrief = parseProjectBrief(chatRow?.brief, project.prompt);
  const storedWorkspaceCard = parseWorkspaceCard(
    chatRow?.workspaceCard,
    currentBrief,
  );
  let workspaceAnswerPatch = buildBriefPatchFromWorkspaceAnswers({
    card: storedWorkspaceCard,
    fallbackText: latestUserText,
    workspaceAnswers: body.workspaceAnswers,
  });

  if (!hasBriefPatchValue(workspaceAnswerPatch)) {
    const recentStoredAnswerTexts = storedMessages
      .filter((message) => message.role === "user")
      .slice(-6)
      .reverse()
      .map(getTextFromUIMessage)
      .filter((text) => /Jawaban:/i.test(text));

    for (const text of recentStoredAnswerTexts) {
      workspaceAnswerPatch = buildBriefPatchFromWorkspaceAnswers({
        card: storedWorkspaceCard,
        fallbackText: text,
        workspaceAnswers: undefined,
      });

      if (hasBriefPatchValue(workspaceAnswerPatch)) {
        break;
      }
    }
  }
  const effectiveBrief = mergeProjectBriefPatch(
    currentBrief,
    workspaceAnswerPatch,
  );

  if (body.mode === "repair_card") {
    return repairWorkspaceCard({
      brief: effectiveBrief,
      messages: storedMessages,
      project,
      userId,
    });
  }

  if (!incoming.length) {
    return Response.json(
      { message: "Pesan tidak boleh kosong." },
      { status: 400 },
    );
  }

  await persistProjectBrief({
    brief: effectiveBrief,
    projectId: project.id,
    userId,
  });

  const messages = await validateUIMessages({
    messages: dedupeUiMessages(
      parseProjectChatMessages([...storedMessages, ...incoming]),
    ),
  });
  const chatContext = buildProjectChatContext({
    fieldState: {},
    memoryFacts,
    messages,
    summary: chatSummary,
  });

  return handleDiscussTurn({
    chatContext,
    effectiveBrief,
    memoryFacts,
    messages,
    project,
    summary: chatSummary,
    userId,
  });
}

async function handleDiscussTurn({
  chatContext,
  effectiveBrief,
  memoryFacts,
  messages,
  project,
  summary,
  userId,
}: {
  chatContext: ReturnType<typeof buildProjectChatContext>;
  effectiveBrief: ReturnType<typeof parseProjectBrief>;
  memoryFacts: ReturnType<typeof parseProjectMemoryFacts>;
  messages: UIMessage[];
  project: { id: string; prompt: string; status: string; title: string };
  summary: ReturnType<typeof parseProjectChatSummary>;
  userId: string;
}) {
  if (isDiscussOneCallToolsEnabled()) {
    return handleDiscussTurnOneCall({
      chatContext,
      effectiveBrief,
      memoryFacts,
      messages,
      project,
      summary,
      userId,
    });
  }

  const modelName = getDefaultAiModel();
  const model = getAiModel(modelName);
  const chatSystemPrompt = buildChatSystemPrompt({
    context: chatContext.systemContext,
    brief: effectiveBrief,
  });
  const cardSystemPrompt = buildCardSystemPrompt();
  const modelMessages = await convertToModelMessages(chatContext.messages);

  await writeAiRequestLog({
    event: "discuss:start",
    model: modelName,
    projectId: project.id,
    messageCount: messages.length,
    briefConfidence: effectiveBrief.confidence,
  });

  const phase1 = streamText({
    model,
    system: chatSystemPrompt,
    messages: modelMessages,
    maxRetries: 2,
    temperature: 0.35,
    timeout: getAiTimeoutMs("discuss"),
    telemetry: getAiTelemetry("project-guided-discuss", {
      briefConfidence: effectiveBrief.confidence,
      mode: "discuss",
      model: modelName,
      projectId: project.id,
      route: "api.projects.preview",
      userId,
    }),
    onError({ error }) {
      console.error(
        "[preview-chat] phase 1 stream error",
        getSafeAiErrorLog(error),
      );
    },
  });

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        const messageId = `discuss-${crypto.randomUUID()}`;
        const textPartId = "discuss-text";

        writer.write({ type: "start", messageId });
        writer.write({ type: "text-start", id: textPartId });

        let fullText = "";
        let hadError = false;

        try {
          for await (const delta of phase1.textStream) {
            fullText += delta;
            writer.write({ type: "text-delta", id: textPartId, delta });
          }
        } catch {
          hadError = true;
        }

        writer.write({ type: "text-end", id: textPartId });

        // Capture phase1 (chat) token usage + actual model that served it
        const phase1Usage = await phase1.usage;
        const phase1Response = await Promise.resolve(phase1.response).catch(
          () => null,
        );
        let totalInputTokens = phase1Usage?.inputTokens ?? 0;
        let totalOutputTokens = phase1Usage?.outputTokens ?? 0;
        const discussModelId = phase1Response?.modelId || modelName;

        if (hadError || !fullText.trim()) {
          // AI already ran — charge even on stream error / empty text.
          await chargeEnergyForAiUsage({
            userId,
            modelId: discussModelId,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            reason: "discuss_turn",
          });
          writer.write({
            type: "error",
            errorText: hadError
              ? "Jawaban AI terputus. Coba lagi."
              : "AI belum memberi jawaban. Coba lagi.",
          });
          return;
        }

        const chatText = fullText.trim();
        const assistantMessage: UIMessage = {
          id: messageId,
          role: "assistant",
          parts: [{ type: "text", text: chatText, state: "done" }],
        };

        const workspaceTurn = await generateWorkspaceTurn({
          brief: effectiveBrief,
          cardSystemPrompt,
          chatText,
          model,
          modelMessages,
          modelName,
          projectId: project.id,
          userId,
        });

        // Capture phase2 (card) token usage
        if (workspaceTurn && "usage" in workspaceTurn) {
          totalInputTokens +=
            (
              workspaceTurn as {
                usage?: { inputTokens: number; outputTokens: number };
              }
            ).usage?.inputTokens ?? 0;
          totalOutputTokens +=
            (
              workspaceTurn as {
                usage?: { inputTokens: number; outputTokens: number };
              }
            ).usage?.outputTokens ?? 0;
        }

        const phase2Failed = !workspaceTurn;

        const hasCard =
          workspaceTurn !== null && workspaceTurn.workspaceCard.type !== "none";

        const safeMessages = stripTransportDiagnosticMessages(
          dedupeUiMessages([...messages, assistantMessage]),
        );

        if (hasCard && workspaceTurn) {
          const title = workspaceTurn.projectTitle || project.title;

          await writeAiRequestLog({
            event: "discuss:finish",
            model: modelName,
            projectId: project.id,
            didWorkspaceToolUpdate: true,
            primaryToolFailed: phase2Failed,
            workspaceCard: workspaceTurn.workspaceCard,
          });

          await persistProjectChatTurn({
            brief: scrubBriefForStorage(
              workspaceTurn.brief,
              workspaceTurn.readyForBuild,
              project.id,
            ),
            messages: safeMessages,
            projectId: project.id,
            title,
            userId,
            workspaceCard: workspaceTurn.workspaceCard,
          });
        } else {
          await writeAiRequestLog({
            event: "discuss:finish",
            model: modelName,
            projectId: project.id,
            didWorkspaceToolUpdate: false,
            primaryToolFailed: phase2Failed,
            workspaceCard: { type: "none" },
          });

          await persistProjectChatTurn({
            messages: safeMessages,
            projectId: project.id,
            userId,
            workspaceCard: { type: "none" },
          });
        }

        const compaction = await maybeCompactProjectChat({
          memoryFacts,
          messages: safeMessages,
          summary,
        }).catch(() => null);

        if (compaction) {
          await persistProjectChatCompaction({
            compactedMessageCount: compaction.compactedMessageCount,
            memoryFacts: compaction.memoryFacts,
            projectId: project.id,
            summary: compaction.summary,
            userId,
          });
          totalInputTokens += compaction.usage?.inputTokens ?? 0;
          totalOutputTokens += compaction.usage?.outputTokens ?? 0;
        }

        await chargeEnergyForAiUsage({
          userId,
          modelId: discussModelId,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          reason: "discuss_turn",
        });

        writer.write({ type: "finish" });
      },
      onError: (error) =>
        `Stream error: ${error instanceof Error ? error.message : "unknown"}`,
    }),
  });
}

const PRESENT_WORKSPACE_CARD_TOOL_NAME = "presentWorkspaceCard";

const presentWorkspaceCardTool = tool({
  description:
    "Present the next workspace card after your short Indonesian chat reply.",
  inputSchema: z.object({
    projectTitle: z.string().optional(),
    readyForBuild: z.boolean().default(false),
    briefPatch: z
      .object({
        confidence: z.number().optional(),
        businessName: z.string().optional(),
        businessType: z.string().optional(),
        offer: z.string().optional(),
        targetCustomer: z.string().optional(),
        contactOrCta: z.string().optional(),
        stylePreference: z.string().optional(),
        notes: z.array(z.string()).optional(),
        openQuestions: z.array(z.string()).optional(),
        productOrService: z
          .array(
            z.object({
              name: z.string(),
              description: z.string().optional(),
              priceRange: z.string().optional(),
              isPrimary: z.boolean().optional(),
            }),
          )
          .optional(),
        contact: z
          .object({
            channel: z.enum([
              "whatsapp",
              "phone",
              "instagram",
              "maps",
              "other",
            ]),
            value: z.string(),
            label: z.string().optional(),
          })
          .optional(),
        tagline: z.string().optional(),
        usp: z.array(z.string()).optional(),
        priceRange: z.string().optional(),
        visuals: z.boolean().optional(),
        hours: z
          .array(
            z.object({
              dayRange: z.string(),
              open: z.string(),
              close: z.string(),
              note: z.string().optional(),
            }),
          )
          .optional(),
        address: z.string().optional(),
        deliveryArea: z.string().optional(),
        since: z.string().optional(),
        testimonials: z
          .array(
            z.object({
              quote: z.string(),
              author: z.string(),
              context: z.string().optional(),
              rating: z.union([z.number(), z.string()]).optional(),
            }),
          )
          .optional(),
        certifications: z
          .array(
            z.object({
              name: z.string(),
              issuer: z.string().optional(),
            }),
          )
          .optional(),
        paymentMethods: z
          .array(
            z.union([
              z.enum(["cash", "transfer", "qris", "ewallet", "cod"]),
              z.object({
                method: z.enum(["cash", "transfer", "qris", "ewallet", "cod"]),
                detail: z.string().optional(),
              }),
            ]),
          )
          .optional(),
        socialLinks: z
          .array(
            z.object({
              platform: z.enum([
                "instagram",
                "tiktok",
                "facebook",
                "youtube",
                "x",
                "other",
              ]),
              handle: z.string(),
              url: z.string().optional(),
            }),
          )
          .optional(),
        currentPromo: z.string().optional(),
        secondaryCta: z
          .object({
            label: z.string(),
            action: z.string(),
          })
          .optional(),
      })
      .optional(),
    workspaceCard: z
      .object({
        type: z.string(),
        title: z.string().optional(),
        summary: z.array(z.string()).optional(),
        question: z
          .object({
            id: z.union([z.string(), z.number()]).optional(),
            question: z.string().optional(),
            text: z.string().optional(),
            title: z.string().optional(),
            answerMode: z.string().optional(),
            selectionMode: z.string().optional(),
            placeholder: z.string().optional(),
            options: z.array(z.any()).optional(),
          })
          .optional(),
        questions: z
          .array(
            z.object({
              id: z.union([z.string(), z.number()]).optional(),
              question: z.string().optional(),
              text: z.string().optional(),
              title: z.string().optional(),
              answerMode: z.string().optional(),
              selectionMode: z.string().optional(),
              placeholder: z.string().optional(),
              recommendedOptionLabel: z.string().optional(),
              whyThisQuestionMatters: z.string().optional(),
              options: z.array(z.any()).optional(),
            }),
          )
          .optional(),
        actions: z.array(z.any()).optional(),
      })
      .optional(),
  }),
});

function buildOneCallSystemPrompt({
  brief,
  context,
}: {
  brief: unknown;
  context: string;
}) {
  return `${buildChatSystemPrompt({ brief, context })}

CRITICAL OUTPUT ORDER:
1) Write 1-3 short Indonesian chat sentences first (aku/kamu only).
2) Then call ${PRESENT_WORKSPACE_CARD_TOOL_NAME} exactly once with the next workspace card.

INTERVIEW DISCIPLINE — rounds questions:
- Emit 1-3 questions per turn. Mixed modes (choice/text, single/multiple) OK in one batch.
- INDEPENDENCE GATE: batch ONLY questions whose answer does not change another question's framing, options, or whether it needs asking. If Q2 depends on Q1's answer, ask Q1 alone this turn; ask Q2 next turn.
- Cap 3 per batch. Server enforces (dedupes id, slices surplus).
- EACH question sets recommendedOptionLabel (your default) — user can accept in one click.
- Do not ask fields inferable from brief/chat. Walk the decision tree, resolve the deepest open dependency first.
- When all applicable fields are filled/declined AND confidence is 95+: emit build_recommendation instead of questions.

Never put JSON in chat text. Never call the tool before chat text.
For questions: type="questions" with questions[] (independent batch), or type="question" for a single question. question.id must be a short slug like business_name or services.
Prefer choice options with label+description (2-5). Use build_recommendation only when confidence is genuinely 95%+ and no open questions remain. Below that, keep asking a question. Never use any other card type.

Be relentless — extract every field, batching independent questions aggressively to reach 95% fast. Slightly annoying upfront is fine; the 95% gate still protects the build. Ask only the applicable soft fields for the UMKM type, but do not skip them.`;
}

async function handleDiscussTurnOneCall({
  chatContext,
  effectiveBrief,
  memoryFacts,
  messages,
  project,
  summary,
  userId,
}: {
  chatContext: ReturnType<typeof buildProjectChatContext>;
  effectiveBrief: ReturnType<typeof parseProjectBrief>;
  memoryFacts: ReturnType<typeof parseProjectMemoryFacts>;
  messages: UIMessage[];
  project: { id: string; prompt: string; status: string; title: string };
  summary: ReturnType<typeof parseProjectChatSummary>;
  userId: string;
}) {
  const modelName = getDefaultAiModel();
  const model = getAiModel(modelName);
  const systemPrompt = buildOneCallSystemPrompt({
    brief: effectiveBrief,
    context: chatContext.systemContext,
  });
  const cardSystemPrompt = buildCardSystemPrompt();
  const modelMessages = await convertToModelMessages(chatContext.messages);

  await writeAiRequestLog({
    event: "discuss:start",
    model: modelName,
    mode: "one_call_tools",
    projectId: project.id,
    messageCount: messages.length,
    briefConfidence: effectiveBrief.confidence,
  });

  const primary = streamText({
    model,
    system: systemPrompt,
    messages: modelMessages,
    tools: { [PRESENT_WORKSPACE_CARD_TOOL_NAME]: presentWorkspaceCardTool },
    toolChoice: "auto",
    maxRetries: 2,
    temperature: 0.35,
    timeout: getAiTimeoutMs("discussOneCall"),
    telemetry: getAiTelemetry("project-guided-discuss-one-call", {
      briefConfidence: effectiveBrief.confidence,
      mode: "discuss-one-call",
      model: modelName,
      projectId: project.id,
      route: "api.projects.preview",
      userId,
    }),
    onError({ error }) {
      console.error(
        "[preview-chat] one-call stream error",
        getSafeAiErrorLog(error),
      );
    },
  });

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        const messageId = `discuss-${crypto.randomUUID()}`;
        const textPartId = "discuss-text";
        const toolCallId = `tool-${crypto.randomUUID()}`;

        writer.write({ type: "start", messageId });
        writer.write({ type: "text-start", id: textPartId });

        let fullText = "";
        let hadError = false;
        let toolInput: unknown = null;
        let streamToolCallId: string | null = null;

        try {
          for await (const part of primary.stream) {
            if (part.type === "text-delta") {
              const delta =
                "text" in part && typeof part.text === "string"
                  ? part.text
                  : "delta" in part && typeof part.delta === "string"
                    ? part.delta
                    : "";
              if (!delta) {
                continue;
              }
              fullText += delta;
              writer.write({ type: "text-delta", id: textPartId, delta });
              continue;
            }

            if (part.type === "tool-call") {
              streamToolCallId =
                "toolCallId" in part && typeof part.toolCallId === "string"
                  ? part.toolCallId
                  : streamToolCallId;
              toolInput =
                "input" in part
                  ? part.input
                  : "args" in part
                    ? (part as { args?: unknown }).args
                    : toolInput;
            }
          }
        } catch {
          hadError = true;
        }

        writer.write({ type: "text-end", id: textPartId });

        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let discussModelId = modelName;
        try {
          const primaryUsage = await primary.usage;
          totalInputTokens = primaryUsage?.inputTokens ?? 0;
          totalOutputTokens = primaryUsage?.outputTokens ?? 0;
          const primaryResponse = await Promise.resolve(primary.response).catch(
            () => null,
          );
          if (primaryResponse?.modelId) {
            discussModelId = primaryResponse.modelId;
          }
        } catch {
          // usage is best-effort
        }

        const chatText = fullText.trim();
        if (hadError || !chatText) {
          await chargeEnergyForAiUsage({
            userId,
            modelId: discussModelId,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            reason: "discuss_turn",
          });
          writer.write({
            type: "error",
            errorText: hadError
              ? "Jawaban AI terputus. Coba lagi."
              : "AI belum memberi jawaban. Coba lagi.",
          });
          return;
        }

        let workspaceTurn = normalizeWorkspaceTurn(toolInput, effectiveBrief);
        let primaryToolFailed = workspaceTurn.workspaceCard.type === "none";
        let repairsUsed = 0;

        if (primaryToolFailed) {
          const repaired = await repairDiscussCardWithTool({
            brief: effectiveBrief,
            cardSystemPrompt,
            chatText,
            model,
            modelMessages,
            modelName,
            projectId: project.id,
            userId,
          });
          if (repaired) {
            workspaceTurn = {
              brief: repaired.brief,
              projectTitle: repaired.projectTitle,
              workspaceCard: repaired.workspaceCard,
              readyForBuild: repaired.readyForBuild,
            };
            primaryToolFailed = false;
            repairsUsed = repaired.repairsUsed;
            totalInputTokens += repaired.usage.inputTokens;
            totalOutputTokens += repaired.usage.outputTokens;
          }
        }

        const hasCard = workspaceTurn.workspaceCard.type !== "none";
        const resolvedToolCallId = streamToolCallId || toolCallId;

        writer.write({
          type: "tool-input-available",
          toolCallId: resolvedToolCallId,
          toolName: PRESENT_WORKSPACE_CARD_TOOL_NAME,
          input: toolInput ?? {},
        });
        writer.write({
          type: "tool-output-available",
          toolCallId: resolvedToolCallId,
          output: {
            workspaceCard: workspaceTurn.workspaceCard,
            projectTitle: workspaceTurn.projectTitle || project.title,
            repairsUsed,
          },
        });

        const assistantMessage: UIMessage = {
          id: messageId,
          role: "assistant",
          parts: [
            { type: "text", text: chatText, state: "done" },
            {
              type: `tool-${PRESENT_WORKSPACE_CARD_TOOL_NAME}`,
              toolCallId: resolvedToolCallId,
              state: "output-available",
              input: toolInput ?? {},
              output: {
                workspaceCard: workspaceTurn.workspaceCard,
                projectTitle: workspaceTurn.projectTitle || project.title,
              },
            } as UIMessage["parts"][number],
          ],
        };

        const safeMessages = stripTransportDiagnosticMessages(
          dedupeUiMessages([...messages, assistantMessage]),
        );

        if (hasCard) {
          const title = workspaceTurn.projectTitle || project.title;
          await writeAiRequestLog({
            event: "discuss:finish",
            model: modelName,
            mode: "one_call_tools",
            projectId: project.id,
            didWorkspaceToolUpdate: true,
            primaryToolFailed,
            repairsUsed,
            workspaceCard: workspaceTurn.workspaceCard,
          });
          await persistProjectChatTurn({
            brief: scrubBriefForStorage(
              workspaceTurn.brief,
              workspaceTurn.readyForBuild,
              project.id,
            ),
            messages: safeMessages,
            projectId: project.id,
            title,
            userId,
            workspaceCard: workspaceTurn.workspaceCard,
          });
        } else {
          await writeAiRequestLog({
            event: "discuss:finish",
            model: modelName,
            mode: "one_call_tools",
            projectId: project.id,
            didWorkspaceToolUpdate: false,
            primaryToolFailed: true,
            repairsUsed,
            workspaceCard: { type: "none" },
          });
          await persistProjectChatTurn({
            messages: safeMessages,
            projectId: project.id,
            userId,
            workspaceCard: { type: "none" },
          });
        }

        const compaction = await maybeCompactProjectChat({
          memoryFacts,
          messages: safeMessages,
          summary,
        }).catch(() => null);

        if (compaction) {
          await persistProjectChatCompaction({
            compactedMessageCount: compaction.compactedMessageCount,
            memoryFacts: compaction.memoryFacts,
            projectId: project.id,
            summary: compaction.summary,
            userId,
          });
          totalInputTokens += compaction.usage?.inputTokens ?? 0;
          totalOutputTokens += compaction.usage?.outputTokens ?? 0;
        }

        await chargeEnergyForAiUsage({
          userId,
          modelId: discussModelId,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          reason: "discuss_turn",
        });

        writer.write({ type: "finish" });
      },
      onError: (error) =>
        `Stream error: ${error instanceof Error ? error.message : "unknown"}`,
    }),
  });
}

async function repairDiscussCardWithTool({
  brief,
  cardSystemPrompt,
  chatText,
  model,
  modelMessages,
  modelName,
  projectId,
  userId,
}: {
  brief: ReturnType<typeof parseProjectBrief>;
  cardSystemPrompt: string;
  chatText: string;
  model: ReturnType<typeof getAiModel>;
  modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
  modelName: string;
  projectId: string;
  userId: string;
}) {
  const abortController = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const attempts = (async () => {
    for (
      let semanticAttempt = 0;
      semanticAttempt < DISCUSS_CARD_SEMANTIC_ATTEMPTS;
      semanticAttempt += 1
    ) {
      try {
        const repaired = await generateText({
          abortSignal: abortController.signal,
          model,
          system: `${cardSystemPrompt}

REPAIR attempt ${semanticAttempt + 1}: previous card was invalid or missing.
Call ${PRESENT_WORKSPACE_CARD_TOOL_NAME} exactly once with a valid workspace card.
Keep a short Indonesian chat preface only if needed. Prefer type=question with 2-5 options.`,
          messages: [
            ...modelMessages,
            { role: "assistant", content: chatText || "(no text)" },
            {
              role: "user",
              content:
                "Perbaiki card-nya supaya valid. Satu pertanyaan jelas, opsi konkret, tanpa JSON di chat.",
            },
          ],
          tools: {
            [PRESENT_WORKSPACE_CARD_TOOL_NAME]: presentWorkspaceCardTool,
          },
          toolChoice: {
            type: "tool",
            toolName: PRESENT_WORKSPACE_CARD_TOOL_NAME,
          },
          temperature: 0.2,
          maxRetries: 1,
          timeout: getAiTimeoutMs("discussCard"),
          telemetry: getAiTelemetry("project-guided-discuss-one-call-repair", {
            mode: "discuss-one-call-repair",
            model: modelName,
            phase: semanticAttempt === 0 ? "repair" : "repair-retry",
            projectId,
            route: "api.projects.preview",
            userId,
          }),
        });

        totalInputTokens += repaired.usage?.inputTokens ?? 0;
        totalOutputTokens += repaired.usage?.outputTokens ?? 0;

        const toolCall = repaired.toolCalls?.[0] as
          { input?: unknown; args?: unknown } | undefined;
        const input = toolCall?.input ?? toolCall?.args ?? null;
        const turn = normalizeWorkspaceTurn(input, brief);
        if (turn.workspaceCard.type !== "none") {
          return {
            ...turn,
            repairsUsed: semanticAttempt + 1,
            usage: {
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
            },
          };
        }
      } catch (error) {
        console.error(
          "[preview-chat] one-call repair error",
          getSafeAiErrorLog(error),
        );
      }
    }
    return null;
  })();

  try {
    return await Promise.race([
      attempts,
      new Promise<null>((resolve) => {
        deadline = setTimeout(() => {
          abortController.abort();
          resolve(null);
        }, DISCUSS_CARD_SERVER_DEADLINE_MS);
      }),
    ]);
  } finally {
    if (deadline) {
      clearTimeout(deadline);
    }
  }
}

async function generateWorkspaceTurn({
  brief,
  cardSystemPrompt,
  chatText,
  model,
  modelMessages,
  modelName,
  projectId,
  userId,
}: {
  brief: ReturnType<typeof parseProjectBrief>;
  cardSystemPrompt: string;
  chatText: string;
  model: ReturnType<typeof getAiModel>;
  modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
  modelName: string;
  projectId: string;
  userId: string;
}) {
  const abortController = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;

  const attempts = (async () => {
    for (
      let semanticAttempt = 0;
      semanticAttempt < DISCUSS_CARD_SEMANTIC_ATTEMPTS;
      semanticAttempt += 1
    ) {
      try {
        const phase2 = await generateText({
          abortSignal: abortController.signal,
          model,
          system: cardSystemPrompt,
          messages: [
            ...modelMessages,
            { role: "assistant", content: chatText },
          ],
          maxOutputTokens: 8192,
          maxRetries: 2,
          temperature: 0.35,
          timeout: getAiTimeoutMs("discussCard"),
          telemetry: getAiTelemetry("project-guided-discuss-card", {
            mode: "discuss",
            model: modelName,
            phase: semanticAttempt === 0 ? "card" : "card-repair",
            projectId,
            route: "api.projects.preview",
            userId,
          }),
        });
        console.error("[preview-chat] phase 2 raw text:", {
          projectId,
          textLen: phase2.text.length,
          textPreview: phase2.text.slice(0, 200),
        });

        const parsed = parseJsonLenient(phase2.text);
        console.error("[preview-chat] phase 2 parsed:", {
          projectId,
          parsedType: typeof parsed,
          parsedPreview: JSON.stringify(parsed)?.slice(0, 200),
        });

        const turn = normalizeWorkspaceTurn(parsed, brief);

        if (turn.workspaceCard.type !== "none") {
          return {
            ...turn,
            usage: {
              inputTokens: phase2.usage?.inputTokens ?? 0,
              outputTokens: phase2.usage?.outputTokens ?? 0,
            },
          };
        }

        console.error("[preview-chat] phase 2 returned no valid card", {
          projectId,
          semanticAttempt,
          cardType: turn.workspaceCard.type,
        });
      } catch (error) {
        console.error(
          "[preview-chat] phase 2 card error",
          getSafeAiErrorLog(error),
        );
      }
    }

    return null;
  })();

  try {
    return await Promise.race([
      attempts,
      new Promise<null>((resolve) => {
        deadline = setTimeout(() => {
          abortController.abort();
          resolve(null);
        }, DISCUSS_CARD_SERVER_DEADLINE_MS);
      }),
    ]);
  } finally {
    if (deadline) {
      clearTimeout(deadline);
    }
  }
}

async function repairWorkspaceCard({
  brief,
  messages,
  project,
  userId,
}: {
  brief: ReturnType<typeof parseProjectBrief>;
  messages: UIMessage[];
  project: { id: string; prompt: string; status: string; title: string };
  userId: string;
}) {
  if (!messages.length) {
    return Response.json(
      {
        code: "workspace_card_repair_unavailable",
        message: "Belum ada diskusi yang bisa dipulihkan.",
      },
      { status: 409 },
    );
  }

  const modelName = getDefaultAiModel();
  const latestAssistantIndex = findLastMessageIndex(
    messages,
    (message) => message.role === "assistant",
  );
  const latestAssistantText = messages[latestAssistantIndex];
  const chatText = latestAssistantText
    ? getTextFromUIMessage(latestAssistantText).trim()
    : "";

  if (!chatText) {
    return Response.json(
      {
        code: "workspace_card_repair_unavailable",
        message:
          "Jawaban AI terakhir belum tersedia. Coba kirim ulang pesanmu.",
      },
      { status: 409 },
    );
  }

  const modelMessages = await convertToModelMessages(
    messages.slice(0, latestAssistantIndex),
  );
  const turn = await repairDiscussCardWithTool({
    brief,
    cardSystemPrompt: buildCardSystemPrompt(),
    chatText,
    model: getAiModel(modelName),
    modelMessages,
    modelName,
    projectId: project.id,
    userId,
  });

  if (!turn) {
    return Response.json(
      {
        code: "workspace_card_repair_failed",
        message: "Pertanyaan berikutnya belum berhasil dibuat. Coba lagi.",
      },
      { status: 503, headers: { "Retry-After": "3" } },
    );
  }

  const title = turn.projectTitle || project.title;
  await persistProjectChatTurn({
    brief: scrubBriefForStorage(turn.brief, turn.readyForBuild, project.id),
    messages,
    projectId: project.id,
    title,
    userId,
    workspaceCard: turn.workspaceCard,
  });

  return Response.json({
    projectTitle: title,
    workspaceCard: turn.workspaceCard,
  });
}

function findLastMessageIndex(
  messages: UIMessage[],
  predicate: (message: UIMessage) => boolean,
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (predicate(messages[index])) {
      return index;
    }
  }
  return -1;
}

function parseJsonLenient(text: string): unknown {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }

    throw new Error("No JSON object found in response");
  }
}

function scrubBriefForStorage(
  brief: ReturnType<typeof parseProjectBrief>,
  readyForBuild: boolean,
  projectId: string,
): ReturnType<typeof parseProjectBrief> {
  const { cleaned, dropped } = validateBrief(brief);
  if (dropped.length > 0) {
    console.warn("brief: dropped hallucinated fields", { dropped, projectId });
  }
  return {
    ...brief,
    ...cleaned,
    businessName: cleaned.businessName ?? brief.businessName,
    targetCustomer: cleaned.targetCustomer ?? brief.targetCustomer,
    readyForBuild,
  };
}

function persistProjectBrief({
  brief,
  projectId,
  userId,
}: {
  brief: unknown;
  projectId: string;
  userId: string;
}) {
  return prisma.$executeRaw`
    UPDATE "Project" SET "brief" = ${JSON.stringify(brief)}::jsonb WHERE id = ${projectId} AND "userId" = ${userId}
  `;
}

function persistProjectChatTurn({
  brief,
  messages,
  projectId,
  title,
  userId,
  workspaceCard,
}: {
  brief?: unknown;
  messages: UIMessage[];
  projectId: string;
  title?: string;
  userId: string;
  workspaceCard: unknown;
}) {
  if (brief !== undefined && title !== undefined) {
    return prisma.$executeRaw`
      UPDATE "Project" SET "chatMessages" = ${JSON.stringify(messages)}::jsonb, "brief" = ${JSON.stringify(brief)}::jsonb, "workspaceCard" = ${JSON.stringify(workspaceCard)}::jsonb, "title" = ${title} WHERE id = ${projectId} AND "userId" = ${userId}
    `;
  }
  return prisma.$executeRaw`
    UPDATE "Project" SET "chatMessages" = ${JSON.stringify(messages)}::jsonb, "workspaceCard" = ${JSON.stringify(workspaceCard)}::jsonb WHERE id = ${projectId} AND "userId" = ${userId}
  `;
}

function persistProjectChatCompaction({
  compactedMessageCount,
  memoryFacts,
  projectId,
  summary,
  userId,
}: {
  compactedMessageCount: number;
  memoryFacts: unknown;
  projectId: string;
  summary: unknown;
  userId: string;
}) {
  return prisma.$executeRaw`
    UPDATE "Project" SET "chatSummary" = ${JSON.stringify(summary)}::jsonb, "memoryFacts" = ${JSON.stringify(memoryFacts)}::jsonb, "lastCompactedMessageCount" = ${compactedMessageCount} WHERE id = ${projectId} AND "userId" = ${userId}
  `;
}

function buildChatSystemPrompt({
  brief,
  context,
}: {
  brief: unknown;
  context: string;
}) {
  return `You are a relentless website-discovery interviewer for Indonesian small businesses.
Your job is to interview the user until their needs are fully understood, then help build only when you are at least 95% confident or the user explicitly asks to build now.

Write user-visible chat copy in natural, concise Indonesian.
Do NOT output JSON, XML, markdown fences, or any structured format. Just write your Indonesian chat response as plain text.

Tone contract:
- Treat the user like a friend building something together.
- Use "aku" for yourself and "kamu" for the user.
- Never address the user as "Anda", "Bapak", "Ibu", "Pak", "Bu", "Kak", "Gan", or other distant/formal labels.
- Keep it warm, relaxed, helpful, and specific.
- Do not become overly slangy, flirty, childish, or hypey. Friendly and calm is enough.

Interview discipline:
- Ask EXACTLY ONE question per turn. Never batch.
- Walk the decision tree one branch at a time, resolving the deepest open dependency first.
- Recommend a sensible default option for each question.
- If something can be inferred from context or the existing brief, do not ask it.
- Keep going until the brief is genuinely clear.

Confidence gate:
- Bias hard toward asking. When unsure, ask another question.
- Build only at 95+ confidence or explicit user request.

Chat style:
- 1-3 sentences.
- Acknowledge the answer, then introduce the next question.
- Do not restate options (the card shows them).
- When recommending build, summarize briefly and point to the build button.

Current brief:
${JSON.stringify(brief)}

Hidden context:
${context}

${DISCUSS_SYSTEM_PROMPT}`;
}

function buildCardSystemPrompt() {
  return `You are a card generator for an Indonesian small business website brief flow.
Based on the conversation, output ONLY a JSON object. No markdown fences, no explanation.

The JSON object must have these fields:
- briefPatch: object with confidence (number 0-100), and any of these optional fields: businessName, businessType, offer, targetCustomer, contactOrCta, stylePreference, notes (string array), openQuestions (string array), facts (array of {key, label, value}), decisions (array of {id, question, answer})
- workspaceCard: object with type (exactly "question" or "build_recommendation")
  - For type "question": question object with id (string slug like business_name), question (string in Indonesian), answerMode ("choice" or "text"), selectionMode ("single" or "multiple"), and either options (array of {label, description} objects, 2-5 items, for choice mode) or placeholder (string, for text mode)
  - For type "build_recommendation": title (string), summary (string array)
- projectTitle: concise Indonesian project name string

Rules:
- workspaceCard.type must be exactly one of: "question", "build_recommendation"
- question.id must be a string (not a number)
- question.options must be an array of objects with label and description strings (not plain strings)
- Set confidence to 95+ only when genuinely build-ready
- Use "build_recommendation" only when confidence is 95+ AND openQuestions is empty. Otherwise ask the next question.

Output valid JSON only. The word json must appear in your thinking.

${DISCUSS_SYSTEM_PROMPT}`;
}

function hasBriefPatchValue(patch: object) {
  return Object.values(patch).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  );
}

function sseError(data: Record<string, unknown>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`event: error\ndata: ${JSON.stringify(data)}\n\n`),
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

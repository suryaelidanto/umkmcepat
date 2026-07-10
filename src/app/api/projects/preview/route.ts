import {
  convertToModelMessages,
  generateText,
  stepCountIs,
  streamText,
  tool,
  type ToolSet,
  type UIMessage,
  validateUIMessages,
} from "ai";

import { getAiModel, getAiTelemetry } from "@/lib/ai";
import { getChatAiModel } from "@/lib/ai-models";
import { writeAiRequestLog } from "@/lib/ai-request-log";
import { getAiTimeoutMs } from "@/lib/ai-timeouts";
import { auth } from "@/lib/auth";
import { isBoundedJsonError, readBoundedJson } from "@/lib/bounded-json";
import { prisma } from "@/lib/prisma";
import {
  mergeProjectBriefPatch,
  parseProjectBrief,
} from "@/lib/projects/brief";
import {
  normalizeWorkspaceTurn,
  parseWorkspaceCard,
  workspaceTurnToolInputSchema,
} from "@/lib/projects/brief-flow";
import { maybeCompactProjectChat } from "@/lib/projects/chat-compaction";
import {
  buildProjectChatContext,
  getTextFromUIMessage,
  parseProjectChatMessages,
  parseProjectChatSummary,
  parseProjectMemoryFacts,
} from "@/lib/projects/chat-memory";
import { buildBriefPatchFromWorkspaceAnswers } from "@/lib/projects/workspace-answers";
import { checkRateLimit } from "@/lib/rate-limit";

import { stripTransportDiagnosticMessages } from "./strip-transport-diagnostic-messages";

export const maxDuration = 180;

type PreviewRequest = {
  message?: UIMessage;
  messages?: UIMessage[];
  mode?: "discuss" | "build";
  projectId?: string;
  workspaceAnswers?: unknown;
};

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  const userId = session.user.id;
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

  const mode = body.mode === "build" ? "build" : "discuss";

  if (!body.projectId) {
    return Response.json({ message: "Proyek tidak valid." }, { status: 400 });
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

  if (!incoming.length) {
    return Response.json(
      { message: "Pesan tidak boleh kosong." },
      { status: 400 },
    );
  }

  // Persist the user's answer before AI work. The discuss path below writes
  // assistant text + workspace card atomically from one structured AI output.
  await prisma.$executeRaw`
    UPDATE "Project" SET "brief" = ${JSON.stringify(effectiveBrief)}::jsonb WHERE id = ${project.id} AND "userId" = ${userId}
  `;

  const messages = await validateUIMessages({
    messages: dedupeUiMessages(
      parseProjectChatMessages([...storedMessages, ...incoming]),
    ),
  });
  const chatContext = buildProjectChatContext({
    memoryFacts,
    messages,
    summary: chatSummary,
  });

  if (mode === "discuss") {
    return handleStructuredDiscussTurn({
      chatContext,
      effectiveBrief,
      memoryFacts,
      messages,
      project,
      storedWorkspaceCard,
      summary: chatSummary,
      userId,
    });
  }

  let didWorkspaceToolUpdate = false;
  const workspaceTools = {
    setWorkspaceUi: tool({
      description:
        "Update the hidden UMKM Cepat workspace brief and interactive UI card. Before calling this tool, always write a short visible Indonesian chat response to the user. Call the tool exactly once per turn after that visible text.",
      inputSchema: workspaceTurnToolInputSchema,
      // The server is the single authority: normalize never throws, so a
      // malformed tool input degrades to a valid fallback card instead of
      // failing the chat turn.
      execute: async (input: unknown) => {
        workspaceTurn = normalizeWorkspaceTurn(input, effectiveBrief);
        didWorkspaceToolUpdate = true;
        const title = workspaceTurn.projectTitle || project.title;

        await prisma.$executeRaw`
          UPDATE "Project" SET "brief" = ${JSON.stringify(workspaceTurn.brief)}::jsonb, "workspaceCard" = ${JSON.stringify(workspaceTurn.workspaceCard)}::jsonb, "title" = ${title} WHERE id = ${project.id} AND "userId" = ${userId}
        `;

        return workspaceTurn;
      },
    }),
  };
  let workspaceTurn = normalizeWorkspaceTurn(undefined, effectiveBrief);

  const result = streamText({
    model: getAiModel(getChatAiModel()),
    system: buildSystemPrompt({
      context: chatContext.systemContext,
      mode,
      brief: effectiveBrief,
    }),
    messages: await convertToModelMessages(chatContext.messages, {
      tools: workspaceTools,
    }),
    tools: workspaceTools,
    toolChoice: "auto",
    stopWhen: stepCountIs(1),
    maxRetries: 0,
    temperature: 0.35,
    timeout: getAiTimeoutMs("discuss"),
    experimental_telemetry: getAiTelemetry("project-chat-build-mode", {
      mode,
      model: getChatAiModel(),
      projectId: project.id,
      route: "api.projects.preview",
      userId,
    }),
    onError({ error }) {
      console.error("[preview-chat] stream error", getSafeAiErrorLog(error));
    },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ messages }) => {
      const safeMessages = stripTransportDiagnosticMessages(
        dedupeUiMessages(parseProjectChatMessages(messages)),
      );

      const title = workspaceTurn.projectTitle || project.title;
      const messagesToPersist = safeMessages;

      if (didWorkspaceToolUpdate) {
        await prisma.$executeRaw`
          UPDATE "Project" SET "chatMessages" = ${JSON.stringify(messagesToPersist)}::jsonb, "brief" = ${JSON.stringify(workspaceTurn.brief)}::jsonb, "workspaceCard" = ${JSON.stringify(workspaceTurn.workspaceCard)}::jsonb, "title" = ${title} WHERE id = ${project.id} AND "userId" = ${userId}
        `;
      } else {
        await prisma.$executeRaw`
          UPDATE "Project" SET "chatMessages" = ${JSON.stringify(messagesToPersist)}::jsonb WHERE id = ${project.id} AND "userId" = ${userId}
        `;
      }

      const compaction = await maybeCompactProjectChat({
        memoryFacts,
        messages: safeMessages,
        summary: chatSummary,
      }).catch(() => null);

      if (compaction) {
        await prisma.$executeRaw`
          UPDATE "Project" SET "chatSummary" = ${JSON.stringify(compaction.summary)}::jsonb, "memoryFacts" = ${JSON.stringify(compaction.memoryFacts)}::jsonb, "lastCompactedMessageCount" = ${compaction.compactedMessageCount} WHERE id = ${project.id} AND "userId" = ${userId}
        `;
      }
    },
  });
}

async function handleStructuredDiscussTurn({
  chatContext,
  effectiveBrief,
  memoryFacts,
  messages,
  project,
  storedWorkspaceCard,
  summary,
  userId,
}: {
  chatContext: ReturnType<typeof buildProjectChatContext>;
  effectiveBrief: ReturnType<typeof parseProjectBrief>;
  memoryFacts: ReturnType<typeof parseProjectMemoryFacts>;
  messages: UIMessage[];
  project: { id: string; prompt: string; status: string; title: string };
  storedWorkspaceCard: ReturnType<typeof parseWorkspaceCard>;
  summary: ReturnType<typeof parseProjectChatSummary>;
  userId: string;
}) {
  const modelName = getChatAiModel();
  let workspaceTurn = normalizeWorkspaceTurn(
    { workspaceCard: storedWorkspaceCard },
    effectiveBrief,
  );
  let didWorkspaceToolUpdate = false;
  let workspaceToolPromise: Promise<void> | null = null;
  const workspaceTools = {
    setWorkspaceUi: tool({
      description:
        "Update the hidden UMKM Cepat workspace brief and interactive UI card. Before calling this tool, always write a short visible Indonesian chat response to the user. Call the tool exactly once per turn after that visible text.",
      inputSchema: workspaceTurnToolInputSchema,
      execute: async (input: unknown) => {
        if (!workspaceToolPromise) {
          const nextWorkspaceTurn = normalizeWorkspaceTurn(
            input,
            effectiveBrief,
          );
          workspaceToolPromise = (async () => {
            workspaceTurn = nextWorkspaceTurn;
            didWorkspaceToolUpdate = true;
            const title = workspaceTurn.projectTitle || project.title;

            await prisma.$executeRaw`
              UPDATE "Project" SET "brief" = ${JSON.stringify(workspaceTurn.brief)}::jsonb, "workspaceCard" = ${JSON.stringify(workspaceTurn.workspaceCard)}::jsonb, "title" = ${title} WHERE id = ${project.id} AND "userId" = ${userId}
            `;

            await writeAiRequestLog({
              event: "discuss:tool-output",
              model: modelName,
              projectId: project.id,
              workspaceCard: workspaceTurn.workspaceCard,
            });
          })();
        }

        await workspaceToolPromise;
        return workspaceTurn;
      },
    }),
  };

  await writeAiRequestLog({
    event: "discuss:start",
    model: modelName,
    projectId: project.id,
    messageCount: messages.length,
    briefConfidence: effectiveBrief.confidence,
  });

  const systemPrompt = buildSystemPrompt({
    context: chatContext.systemContext,
    mode: "discuss",
    brief: effectiveBrief,
  });
  const modelMessages = await convertToModelMessages(chatContext.messages, {
    tools: workspaceTools,
  });
  const result = streamText({
    model: getAiModel(modelName),
    system: systemPrompt,
    messages: modelMessages,
    tools: workspaceTools,
    toolChoice: "required",
    stopWhen: stepCountIs(1),
    maxRetries: 0,
    temperature: 0.35,
    timeout: getAiTimeoutMs("discuss"),
    experimental_telemetry: getAiTelemetry("project-guided-discuss", {
      briefConfidence: effectiveBrief.confidence,
      mode: "discuss",
      model: modelName,
      projectId: project.id,
      route: "api.projects.preview",
      userId,
    }),
    onStepFinish({ finishReason, toolCalls, toolResults }) {
      void writeAiRequestLog({
        event: "discuss:step-finish",
        model: modelName,
        projectId: project.id,
        finishReason,
        toolCallCount: toolCalls.length,
        toolResultCount: toolResults.length,
      });
    },
    onError({ error }) {
      console.error(
        "[preview-chat] discuss stream error",
        getSafeAiErrorLog(error),
      );
    },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ messages }) => {
      let safeMessages = stripTransportDiagnosticMessages(
        dedupeUiMessages(parseProjectChatMessages(messages)),
      );
      let primaryToolFailed = false;

      if (workspaceToolPromise) {
        try {
          await workspaceToolPromise;
        } catch (error) {
          primaryToolFailed = true;
          workspaceToolPromise = null;
          await writeAiRequestLog({
            event: "discuss:tool-primary-error",
            model: modelName,
            projectId: project.id,
            error: getSafeAiErrorLog(error),
          });
        }
      }

      if (!workspaceToolPromise) {
        await repairMissingWorkspaceTool({
          messages: await convertToModelMessages(safeMessages, {
            tools: workspaceTools,
          }),
          modelName,
          projectId: project.id,
          systemPrompt,
          tools: workspaceTools,
        });
      }

      if (
        didWorkspaceToolUpdate &&
        !safeMessages.some(hasWorkspaceToolOutput)
      ) {
        safeMessages = [
          ...safeMessages,
          createPersistedWorkspaceToolMessage(workspaceTurn),
        ];
      }

      const title = workspaceTurn.projectTitle || project.title;

      await writeAiRequestLog({
        event: "discuss:finish",
        model: modelName,
        projectId: project.id,
        didWorkspaceToolUpdate,
        primaryToolFailed,
        workspaceCard: workspaceTurn.workspaceCard,
      });

      if (didWorkspaceToolUpdate) {
        await prisma.$executeRaw`
          UPDATE "Project" SET "chatMessages" = ${JSON.stringify(safeMessages)}::jsonb, "brief" = ${JSON.stringify(workspaceTurn.brief)}::jsonb, "workspaceCard" = ${JSON.stringify(workspaceTurn.workspaceCard)}::jsonb, "title" = ${title} WHERE id = ${project.id} AND "userId" = ${userId}
        `;
      } else {
        await prisma.$executeRaw`
          UPDATE "Project" SET "chatMessages" = ${JSON.stringify(safeMessages)}::jsonb WHERE id = ${project.id} AND "userId" = ${userId}
        `;
      }

      const compaction = await maybeCompactProjectChat({
        memoryFacts,
        messages: safeMessages,
        summary,
      }).catch(() => null);

      if (compaction) {
        await prisma.$executeRaw`
          UPDATE "Project" SET "chatSummary" = ${JSON.stringify(compaction.summary)}::jsonb, "memoryFacts" = ${JSON.stringify(compaction.memoryFacts)}::jsonb, "lastCompactedMessageCount" = ${compaction.compactedMessageCount} WHERE id = ${project.id} AND "userId" = ${userId}
        `;
      }
    },
  });
}

async function repairMissingWorkspaceTool({
  messages,
  modelName,
  projectId,
  systemPrompt,
  tools,
}: {
  messages: Awaited<ReturnType<typeof convertToModelMessages>>;
  modelName: string;
  projectId: string;
  systemPrompt: string;
  tools: ToolSet;
}) {
  await writeAiRequestLog({
    event: "discuss:tool-repair-start",
    model: modelName,
    projectId,
  });

  try {
    const repair = await generateText({
      model: getAiModel(modelName),
      system: `${systemPrompt}\n\nRecovery pass: the visible answer was already streamed. Do not write user-visible text. Call setWorkspaceUi exactly once now with the brief update and next workspace card.`,
      messages,
      tools,
      toolChoice: { type: "tool", toolName: "setWorkspaceUi" },
      stopWhen: stepCountIs(1),
      maxRetries: 0,
      temperature: 0.2,
      timeout: getAiTimeoutMs("discussToolSettle"),
      experimental_telemetry: getAiTelemetry(
        "project-guided-discuss-tool-repair",
        {
          model: modelName,
          projectId,
          route: "api.projects.preview",
        },
      ),
    });

    await writeAiRequestLog({
      event: "discuss:tool-repair-finish",
      model: modelName,
      projectId,
      finishReason: repair.finishReason,
      toolCallCount: repair.toolCalls.length,
      toolResultCount: repair.toolResults.length,
    });
  } catch (error) {
    await writeAiRequestLog({
      event: "discuss:tool-repair-error",
      model: modelName,
      projectId,
      error: getSafeAiErrorLog(error),
    });
  }
}

function hasWorkspaceToolOutput(message: UIMessage) {
  return message.parts.some(
    (part) =>
      part.type === "tool-setWorkspaceUi" &&
      (part as { state?: unknown }).state === "output-available",
  );
}

function createPersistedWorkspaceToolMessage(
  workspaceTurn: ReturnType<typeof normalizeWorkspaceTurn>,
): UIMessage {
  const toolCallId = `workspace-repair-${crypto.randomUUID()}`;

  return {
    id: toolCallId,
    role: "assistant",
    parts: [
      {
        type: "tool-setWorkspaceUi",
        toolCallId,
        state: "output-available",
        input: {},
        output: workspaceTurn,
      } as UIMessage["parts"][number],
    ],
  };
}

function dedupeUiMessages(messages: UIMessage[]) {
  const seen = new Set<string>();
  return messages.filter((message) => {
    const text = getTextFromUIMessage(message);
    const key = message.id || `${message.role}:${text}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getSafeAiErrorLog(error: unknown) {
  const value = error as {
    lastError?: {
      statusCode?: number;
      responseHeaders?: Record<string, string>;
    };
    reason?: string;
  };
  const statusCode = value.lastError?.statusCode;
  const retryAfter = value.lastError?.responseHeaders?.["retry-after"];

  return {
    reason: value.reason || "unknown",
    retryAfter,
    statusCode,
  };
}

function buildSystemPrompt({
  brief,
  context,
  mode,
}: {
  brief: unknown;
  context: string;
  mode: "build" | "discuss";
}) {
  return `You are a relentless website-discovery interviewer for Indonesian small businesses.
Your job in Discuss mode is to interview the user until their needs are fully understood, then help build only when you are at least 95% confident or the user explicitly asks to build now.

Write user-visible chat copy in natural, concise Indonesian.
Critical streaming contract:
- Always emit a visible assistant text response first, then call setWorkspaceUi.
- Never answer with only a tool call. The user must see streamed text in the chat bubble every turn.
- Keep the visible text short: acknowledge their answer, then introduce the next question/card in one or two sentences.
Tone contract:
- Treat the user like a friend building something together, not like a formal customer-service ticket.
- Use "aku" for yourself and "kamu" for the user.
- Never address the user as "Anda", "Bapak", "Ibu", "Pak", "Bu", "Kak", "Gan", or other distant/formal labels.
- Keep it warm, relaxed, helpful, and specific. Avoid stiff phrases like "Saya perlu mengetahui", "berdasarkan keterangan Anda", or "pelanggan Anda".
- Prefer phrasing like "Oke, aku nangkap...", "biar websitenya pas...", "satu hal lagi...", "menurutku yang paling penting sekarang...".
- The same tone applies to workspaceCard questions, option labels/descriptions, review actions, and summaries.
- Do not become overly slangy, flirty, childish, or hypey. Friendly and calm is enough.
Do not reveal chain-of-thought.
Do not write JSON, XML, markdown schemas, or option lists in chat text.
Do not use emojis, decorative symbols, or hype labels in chat text or tool fields.
Do not send raw HTML/CSS/JS in chat text.

Active mode: ${mode === "build" ? "Build" : "Discuss"}.

Interview discipline (grilling):
- Ask EXACTLY ONE question per turn. Never batch multiple questions. Asking several at once is bewildering.
- Walk the decision tree one branch at a time, resolving the deepest open dependency first.
- For each question, recommend a sensible default option.
- If something can be inferred from context or the existing brief, do not ask it.
- Keep going until the brief is genuinely clear. Depth adapts to the request: a simple shop needs few questions, a richer business needs many. Do not stop early just because the legacy metadata fields are filled.

Confidence gate (before recommending build):
- Set briefPatch.confidence every turn from 0-100.
- Stay in question mode unless confidence is at least 95, every material decision is resolved, answers are specific (not vague like "terserah" or "bagus aja"), there are no contradictions, and you have reflected the brief back for agreement.
- Use briefPatch.openQuestions for unresolved material decisions. Clear it only when confidence is genuinely 95+.
- Bias hard toward asking. When unsure, ask another question. Build is the exception, not the goal.
- Exception: if the user clearly asks to build now (in any wording or language), you may recommend build even below 95, but set briefPatch.forcedBuild.assumed with the assumptions still used.

Mandatory tool contract:
- In Discuss mode, call setWorkspaceUi exactly once on every turn.
- The tool is the hidden channel for brief updates and the interactive UI. Do not explain tool/JSON internals to the user.
- While interviewing, set workspaceCard.type to "question" with a single question.
- Choose the easiest input mode for the user, not the easiest mode for you.
- Use question.answerMode "text" only for exact unknown values the user must type, such as business name, WhatsApp number, address, opening hours, owner name, precise menu/item names, or a custom slogan.
- Do not use free text for a decision where curated options would reduce effort and ambiguity.
- Use question.answerMode "choice" when the user is deciding among understandable paths, categories, features, sections, audiences, channels, service styles, or product/menu groups.
- Choice questions must have 2-5 specific, non-overlapping options with short labels and helpful descriptions. Avoid vague labels, duplicate meanings, and generic template categories.
- Set question.selectionMode to "multiple" when several options can be true together or when the user is selecting all applicable items, such as menus, products, services, page sections, customer groups, sales channels, delivery methods, proof/trust items, or supported actions.
- Set question.selectionMode to "single" only when choosing one option would clearly simplify the next decision, such as one primary audience, one visual direction, one ordering flow, one main CTA, or one priority.
- If the user likely has several valid items but exact names are not yet needed, prefer choice + multiple first; ask exact text details later only for the selected items.
- Never ask the user to type a broad list when a multi-select card can make the decision easier.
- When the core brief is usable but you still want user confirmation or optional refinement, set workspaceCard.type to "brief_review" with natural actions like build now, adjust offer, adjust visual direction, or add missing detail. Do not fabricate another question.
- Only when the confidence gate passes (or the user forces build), set workspaceCard.type to "build_recommendation".
- question.id is a short free-form slug for the decision being asked, such as opening_hours, delivery_area, product_count, visual_direction, booking_flow, or target_customer. It does not need to match legacy metadata fields.
- Canonical structured memory is briefPatch.facts and briefPatch.decisions. Add/update facts with stable keys for learned business facts, and add/update one decision when the user answers the active card.
- Legacy metadata fields (businessName, businessType, offer, targetCustomer, contactOrCta, stylePreference) are only compatibility caches for build prompts. Fill them when obvious, but never treat them as readiness gates.
- Capture deeper details in briefPatch.facts/decisions first; use notes only for extra nuance that does not fit a fact or decision.
- Options must be specific to the user's business, not generic templates.
- For brief_review and build_recommendation, write summary as a flexible implementation spec shaped by the user's real needs, not fixed template labels.
- When the user answers the current question, write the answer into briefPatch.
- Set projectTitle when you can name the project more clearly than the user's raw first prompt. Keep it concise, specific, and Indonesian.

Chat style:
- 1-3 sentences.
- Sound like a capable friend: short, warm, concrete.
- When asking, give brief context for why the decision matters; do not restate the options (the card shows them).
- When recommending build, summarize briefly and point to the build button.

Current brief:
${JSON.stringify(brief)}

Hidden context:
${context}`;
}

function hasBriefPatchValue(patch: object) {
  return Object.values(patch).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  );
}

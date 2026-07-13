import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  jsonSchema,
  Output,
  stepCountIs,
  streamText,
  type UIMessage,
  validateUIMessages,
} from "ai";

import { getAiModel, getAiTelemetry } from "@/lib/ai";
import { getDefaultAiModel } from "@/lib/ai-models";
import { writeAiRequestLog } from "@/lib/ai-request-log";
import { getAiTimeoutMs } from "@/lib/ai-timeouts";
import { auth } from "@/lib/auth";
import { isBoundedJsonError, readBoundedJson } from "@/lib/bounded-json";
import { prisma } from "@/lib/prisma";
import { getSafeAiErrorLog } from "@/lib/projects/ai-error-log";
import {
  mergeProjectBriefPatch,
  parseProjectBrief,
} from "@/lib/projects/brief";
import {
  normalizeWorkspaceTurn,
  parseWorkspaceCard,
  type WorkspaceTurnToolInput,
} from "@/lib/projects/brief-flow";
import { maybeCompactProjectChat } from "@/lib/projects/chat-compaction";
import {
  buildProjectChatContext,
  dedupeUiMessages,
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

const discussOutputSchema = jsonSchema<WorkspaceTurnToolInput>({
  type: "object",
  properties: {
    chatText: {
      type: "string",
      description:
        "The user-visible Indonesian chat response. 1-3 sentences: acknowledge the answer, introduce the next question or card. Always include this field.",
    },
    briefPatch: {
      type: "object",
      description:
        "Known brief fields captured so far. Fill only what the user has actually decided.",
      properties: {
        businessType: { type: "string" },
        offer: { type: "string" },
        targetCustomer: { type: "string" },
        contactOrCta: { type: "string" },
        businessName: { type: "string" },
        confidence: {
          type: "number",
          description:
            "AI-owned readiness confidence from 0 to 100. Use 95+ only when genuinely build-ready.",
        },
        stylePreference: { type: "string" },
        notes: { type: "array", items: { type: "string" } },
        openQuestions: {
          type: "array",
          description:
            "Material unresolved decisions before recommending build.",
          items: { type: "string" },
        },
        facts: {
          type: "array",
          description:
            "Canonical facts learned. Use stable keys like business_name, whatsapp, address.",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              label: { type: "string" },
              value: { type: "string" },
            },
          },
        },
        decisions: {
          type: "array",
          description:
            "Canonical user decisions. Add one when the user answers the active question.",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              question: { type: "string" },
              answer: { type: "string" },
            },
          },
        },
        forcedBuild: {
          type: "object",
          description:
            "Set only when the user explicitly forces build before confidence 95.",
          properties: {
            assumed: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    projectTitle: {
      type: "string",
      description: "A concise, specific Indonesian project name.",
    },
    workspaceCard: {
      type: "object",
      description:
        "Interactive UI card. Use type 'question' to ask the next single decision, or type 'build_recommendation' once the brief is clear.",
      properties: {
        type: { type: "string" },
        question: {
          type: "object",
          description:
            "Exactly one decision to ask this turn, with 2-5 specific options.",
          properties: {
            id: { type: "string" },
            question: { type: "string" },
            answerMode: {
              type: "string",
              description:
                "Use 'text' for exact values like name, WhatsApp, address. Use 'choice' for decisions with options.",
              enum: ["choice", "text"],
            },
            recommendedOptionLabel: { type: "string" },
            selectionMode: {
              type: "string",
              description:
                "'single' when one path; 'multiple' when several can be true.",
              enum: ["single", "multiple"],
            },
            placeholder: { type: "string" },
            whyThisQuestionMatters: { type: "string" },
            options: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  description: { type: "string" },
                },
              },
            },
          },
        },
        title: { type: "string" },
        summary: {
          type: "array",
          description: "Flexible implementation spec shaped by real needs.",
          items: { type: "string" },
        },
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              prompt: { type: "string" },
            },
          },
        },
      },
    },
  },
});

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
  const modelName = getDefaultAiModel();
  const systemPrompt = buildSystemPrompt({
    context: chatContext.systemContext,
    brief: effectiveBrief,
  });
  const modelMessages = await convertToModelMessages(chatContext.messages);

  await writeAiRequestLog({
    event: "discuss:start",
    model: modelName,
    projectId: project.id,
    messageCount: messages.length,
    briefConfidence: effectiveBrief.confidence,
  });

  let lastChatText = "";
  let lastPartial: unknown = null;

  const result = streamText({
    model: getAiModel(modelName),
    system: systemPrompt,
    messages: modelMessages,
    output: Output.object({
      name: "WorkspaceTurn",
      description:
        "Return a JSON object with chatText (user-visible Indonesian response), briefPatch (brief updates), workspaceCard (next interactive card), and projectTitle.",
      schema: discussOutputSchema,
    }),
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
    onError({ error }) {
      console.error(
        "[preview-chat] discuss stream error",
        getSafeAiErrorLog(error),
      );
    },
  });

  const partialStream = result.partialOutputStream;

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        for await (const partial of partialStream) {
          lastPartial = partial;
          const chatText = extractChatText(partial);

          if (chatText && chatText !== lastChatText) {
            const delta = chatText.slice(lastChatText.length);
            if (delta) {
              writer.write({ type: "text-delta", id: "discuss-text", delta });
            }
            lastChatText = chatText;
          }
        }

        const finalObject = lastPartial as WorkspaceTurnToolInput | null;
        const chatText = extractChatText(finalObject);
        const workspaceTurn =
          finalObject && (finalObject.workspaceCard || finalObject.briefPatch)
            ? normalizeWorkspaceTurn(finalObject, effectiveBrief)
            : null;
        const hasStructuredOutput =
          workspaceTurn !== null && workspaceTurn.workspaceCard.type !== "none";

        const assistantMessage: UIMessage = {
          id: `discuss-${crypto.randomUUID()}`,
          role: "assistant",
          parts: [
            {
              type: "text",
              text:
                chatText ||
                "Oke, aku nangkap. Ada lagi yang mau kamu sampaikan?",
              state: "done",
            },
          ],
        };

        writer.write({ type: "start", messageId: assistantMessage.id });

        writer.write({ type: "finish" });

        if (hasStructuredOutput && workspaceTurn) {
          const title = workspaceTurn.projectTitle || project.title;

          await writeAiRequestLog({
            event: "discuss:finish",
            model: modelName,
            projectId: project.id,
            didWorkspaceToolUpdate: true,
            primaryToolFailed: false,
            workspaceCard: workspaceTurn.workspaceCard,
          });

          const safeMessages = stripTransportDiagnosticMessages(
            dedupeUiMessages([...messages, assistantMessage]),
          );

          await persistProjectChatTurn({
            brief: workspaceTurn.brief,
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
            primaryToolFailed: false,
            workspaceCard: { type: "none" },
          });

          const safeMessages = stripTransportDiagnosticMessages(
            dedupeUiMessages([...messages, assistantMessage]),
          );

          await persistProjectChatTurn({
            messages: safeMessages,
            projectId: project.id,
            userId,
          });
        }

        const compaction = await maybeCompactProjectChat({
          memoryFacts,
          messages: stripTransportDiagnosticMessages(
            dedupeUiMessages([...messages, assistantMessage]),
          ),
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
        }
      },
      onError: (error) =>
        `Stream error: ${error instanceof Error ? error.message : "unknown"}`,
    }),
  });
}

function extractChatText(partial: unknown): string {
  if (!partial || typeof partial !== "object") {
    return "";
  }
  const obj = partial as { chatText?: unknown };
  return typeof obj.chatText === "string" ? obj.chatText : "";
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
  workspaceCard?: unknown;
}) {
  if (
    brief !== undefined &&
    workspaceCard !== undefined &&
    title !== undefined
  ) {
    return prisma.$executeRaw`
      UPDATE "Project" SET "chatMessages" = ${JSON.stringify(messages)}::jsonb, "brief" = ${JSON.stringify(brief)}::jsonb, "workspaceCard" = ${JSON.stringify(workspaceCard)}::jsonb, "title" = ${title} WHERE id = ${projectId} AND "userId" = ${userId}
    `;
  }
  return prisma.$executeRaw`
    UPDATE "Project" SET "chatMessages" = ${JSON.stringify(messages)}::jsonb WHERE id = ${projectId} AND "userId" = ${userId}
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

function buildSystemPrompt({
  brief,
  context,
}: {
  brief: unknown;
  context: string;
}) {
  return `You are a relentless website-discovery interviewer for Indonesian small businesses.
Your job is to interview the user until their needs are fully understood, then help build only when you are at least 95% confident or the user explicitly asks to build now.

You must respond with a JSON object containing these fields:
- chatText: The user-visible Indonesian chat response (1-3 sentences). Always include this field.
- briefPatch: Brief updates (facts, decisions, confidence, openQuestions, etc).
- workspaceCard: The next interactive UI card (type "question" with one question, or "build_recommendation" when ready).
- projectTitle: A concise Indonesian project name when you can improve on the user's first prompt.

Output format:
- Always produce valid JSON.
- chatText is the ONLY user-visible text. It appears in the chat bubble.
- workspaceCard is the hidden interactive card. It is NOT shown as text.
- Never put JSON, XML, markdown, option lists, or raw HTML in chatText.
- Never use emojis or decorative symbols in any field.

Tone contract:
- Treat the user like a friend building something together.
- Use "aku" for yourself and "kamu" for the user.
- Never address the user as "Anda", "Bapak", "Ibu", "Pak", "Bu", "Kak", "Gan", or other distant/formal labels.
- Keep it warm, relaxed, helpful, and specific.
- Do not become overly slangy, flirty, childish, or hypey. Friendly and calm is enough.
- The same tone applies to workspaceCard questions, option labels/descriptions, review actions, and summaries.

Interview discipline:
- Ask EXACTLY ONE question per turn via workspaceCard. Never batch.
- Walk the decision tree one branch at a time, resolving the deepest open dependency first.
- Recommend a sensible default option for each question.
- If something can be inferred from context or the existing brief, do not ask it.
- Keep going until the brief is genuinely clear.

Confidence gate:
- Set briefPatch.confidence every turn from 0-100.
- Stay in question mode unless confidence is at least 95, every material decision is resolved, answers are specific, no contradictions, and you have reflected the brief back.
- Use briefPatch.openQuestions for unresolved material decisions. Clear it only when confidence is genuinely 95+.
- Bias hard toward asking. When unsure, ask another question.
- Exception: if the user clearly asks to build now, set workspaceCard.type to "build_recommendation" and briefPatch.forcedBuild.assumed.

workspaceCard design:
- While interviewing: type "question" with a single question.
- answerMode "text" for exact values (business name, WhatsApp, address, hours, menu names).
- answerMode "choice" for decisions with 2-5 specific, non-overlapping options.
- selectionMode "multiple" when several options can be true; "single" when one path simplifies the next decision.
- When the brief is usable but needs confirmation: type "brief_review" with actions.
- When confidence passes or user forces build: type "build_recommendation".
- question.id is a short slug like opening_hours, delivery_area, visual_direction.
- Options must be specific to the user's business, not generic templates.
- For brief_review and build_recommendation, write summary as a flexible implementation spec.

Memory:
- briefPatch.facts: stable keys for learned business facts.
- briefPatch.decisions: add one when the user answers the active question.
- Legacy fields (businessName, businessType, offer, targetCustomer, contactOrCta, stylePreference) are compatibility caches. Fill when obvious.

Chat style:
- 1-3 sentences in chatText.
- Acknowledge the answer, then introduce the next question/card.
- Do not restate options (the card shows them).
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

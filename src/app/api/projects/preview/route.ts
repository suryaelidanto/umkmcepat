import {
  convertToModelMessages,
  streamText,
  tool,
  type UIMessage,
  validateUIMessages,
} from "ai";

import { getAiModel } from "@/lib/ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  mergeProjectBriefPatch,
  parseProjectBrief,
} from "@/lib/projects/brief";
import {
  createFallbackWorkspaceCard,
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

export const maxDuration = 60;

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

  const body = (await request.json().catch(() => ({}))) as PreviewRequest;
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

  // Phase 1 (deterministic, before the AI stream): persist the user's answer
  // into the brief and advance the stored card to the next missing field.
  // The user's answer is server-owned and must never be lost, so even if the
  // AI turn fails mid-stream the brief still moves forward and the card never
  // sticks on an already-answered question.
  const fallbackCard = createFallbackWorkspaceCard(effectiveBrief);
  await prisma.$executeRaw`
    UPDATE "Project" SET "brief" = ${JSON.stringify(effectiveBrief)}::jsonb, "workspaceCard" = ${JSON.stringify(fallbackCard)}::jsonb WHERE id = ${project.id} AND "userId" = ${userId}
  `;

  const workspaceTools = {
    setWorkspaceUi: tool({
      description:
        "Update the hidden UMKM Cepat workspace brief and interactive UI card. Call exactly once per turn. The platform validates and normalizes the input, so prefer sending your best attempt over staying silent.",
      inputSchema: workspaceTurnToolInputSchema,
      // The server is the single authority: normalize never throws, so a
      // malformed tool input degrades to a valid fallback card instead of
      // failing the chat turn.
      execute: async (input: unknown) => {
        workspaceTurn = normalizeWorkspaceTurn(input, effectiveBrief);
        return workspaceTurn;
      },
    }),
  };
  const messages = await validateUIMessages({
    messages: [...storedMessages, ...incoming],
  });
  const chatContext = buildProjectChatContext({
    memoryFacts,
    messages,
    summary: chatSummary,
  });
  let workspaceTurn = normalizeWorkspaceTurn(undefined, effectiveBrief);

  const result = streamText({
    model: getAiModel(),
    system: buildSystemPrompt({
      context: chatContext.systemContext,
      mode,
      brief: effectiveBrief,
    }),
    messages: await convertToModelMessages(chatContext.messages, {
      tools: workspaceTools,
    }),
    tools: workspaceTools,
    temperature: 0.35,
    onError({ error }) {
      // Surface the verbatim cause server-side; the client only sees a generic
      // recoverable error, never the raw provider message.
      console.error("[preview-chat] stream error", error);
    },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ messages }) => {
      const title = workspaceTurn.projectTitle || project.title;

      await prisma.$executeRaw`
        UPDATE "Project" SET "chatMessages" = ${JSON.stringify(messages)}::jsonb, "brief" = ${JSON.stringify(workspaceTurn.brief)}::jsonb, "workspaceCard" = ${JSON.stringify(workspaceTurn.workspaceCard)}::jsonb, "title" = ${title} WHERE id = ${project.id} AND "userId" = ${userId}
      `;

      const compaction = await maybeCompactProjectChat({
        memoryFacts,
        messages,
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
- Keep going until the brief is genuinely clear. Depth adapts to the request: a simple shop needs few questions, a richer business needs many. Do not stop early just because the core fields are filled.

Confidence gate (before recommending build):
- Stay in question mode unless ALL are true: every material decision is resolved, answers are specific (not vague like "terserah" or "bagus aja"), there are no contradictions, and you have reflected the brief back and the user agreed.
- Bias hard toward asking. When unsure, ask another question. Build is the exception, not the goal.
- Exception: if the user clearly asks to build now (in any wording or language), you may recommend build even with an incomplete brief, but briefly note what is still assumed.

Mandatory tool contract:
- In Discuss mode, call setWorkspaceUi exactly once on every turn.
- The tool is the hidden channel for brief updates and the interactive UI. Do not explain tool/JSON internals to the user.
- While interviewing, set workspaceCard.type to "question" with a single question and 3-5 specific options.
- Set question.selectionMode to "single" when the user should pick one path. Set it to "multiple" only when several options can be true together, such as products, channels, sections, or customer segments.
- Do not use "multiple" as the default; if one choice gives a cleaner next decision, use "single".
- When the core brief is usable but you still want user confirmation or optional refinement, set workspaceCard.type to "brief_review" with natural actions like build now, adjust offer, adjust visual direction, or add missing detail. Do not fabricate another question.
- Only when the confidence gate passes (or the user forces build), set workspaceCard.type to "build_recommendation".
- question.id must be one missing brief field: businessType, offer, targetCustomer, contactOrCta, stylePreference. Capture deeper details in briefPatch.notes.
- Options must be specific to the user's business, not generic templates.
- For brief_review and build_recommendation, write summary as a flexible implementation spec shaped by the user's real needs, not fixed template labels.
- When the user answers the current question, write the answer into briefPatch.
- Set projectTitle when you can name the project more clearly than the user's raw first prompt. Keep it concise, specific, and Indonesian.

Chat style:
- 1-3 sentences.
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

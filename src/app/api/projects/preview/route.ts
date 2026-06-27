import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  validateUIMessages,
} from "ai";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  mergeProjectBriefPatch,
  parseProjectBrief,
} from "@/lib/projects/brief";
import {
  createPendingWorkspaceCard,
  generateNextWorkspaceCard,
  parseWorkspaceCard,
} from "@/lib/projects/brief-flow";
import { maybeCompactProjectChat } from "@/lib/projects/chat-compaction";
import {
  buildProjectChatContext,
  getTextFromUIMessage,
  parseProjectChatMessages,
  parseProjectChatSummary,
  parseProjectMemoryFacts,
} from "@/lib/projects/chat-memory";
import {
  createFallbackDiscussionTurn,
  generateDiscussionTurn,
} from "@/lib/projects/discussion-turn";
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
  const rateLimitResponse = await checkRateLimit(request, "ai");

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
    select: { id: true, status: true, prompt: true },
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

  const messages = await validateUIMessages({
    messages: [...storedMessages, ...incoming],
  });
  const chatContext = buildProjectChatContext({
    memoryFacts,
    messages,
    summary: chatSummary,
  });
  const turn = await generateDiscussionTurn({
    brief: effectiveBrief,
    chatContext,
    latestUserText,
    messages: chatContext.messages,
    mode,
  }).catch(async () => {
    const fallbackTurn = createFallbackDiscussionTurn(effectiveBrief);
    const fallbackCard = await generateNextWorkspaceCard(effectiveBrief).catch(
      () => createPendingWorkspaceCard(effectiveBrief),
    );

    return {
      ...fallbackTurn,
      intent:
        fallbackCard.type === "questions"
          ? ("ask_question" as const)
          : fallbackTurn.intent,
      workspaceCard: fallbackCard,
    };
  });
  const updatedBrief = mergeProjectBriefPatch(effectiveBrief, turn.briefPatch);
  const workspaceCard = turn.workspaceCard;

  const stream = createUIMessageStream({
    originalMessages: messages,
    execute({ writer }) {
      const textId = crypto.randomUUID();
      writer.write({ type: "text-start", id: textId });
      writer.write({
        type: "text-delta",
        id: textId,
        delta: turn.assistantMessage,
      });
      writer.write({ type: "text-end", id: textId });
    },
    onFinish: async ({ messages }) => {
      await prisma.$executeRaw`
        UPDATE "Project" SET "chatMessages" = ${JSON.stringify(messages)}::jsonb, "brief" = ${JSON.stringify(updatedBrief)}::jsonb, "workspaceCard" = ${JSON.stringify(workspaceCard)}::jsonb WHERE id = ${project.id} AND "userId" = ${userId}
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

  return createUIMessageStreamResponse({ stream });
}

function hasBriefPatchValue(patch: object) {
  return Object.values(patch).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  );
}

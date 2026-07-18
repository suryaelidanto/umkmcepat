import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import type { ProjectBrief, WorkspaceCard } from "@/lib/projects/brief";
import type { UIMessage } from "ai";

import { FirstBuildModal } from "@/components/onboarding/FirstBuildModal";
import { KopiFab } from "@/components/onboarding/KopiFab";
import { ClearProjectDraft } from "@/components/projects/ClearProjectDraft";
import { WorkspaceShell } from "@/components/projects/WorkspaceShell";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseProjectBrief } from "@/lib/projects/brief";
import { parseWorkspaceCard } from "@/lib/projects/brief-flow";
import {
  getProjectChatPage,
  parseProjectChatMessages,
} from "@/lib/projects/chat-memory";

const loadProject = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const session = await auth();

    if (!session?.user?.id) {
      throw redirect({ to: "/" });
    }

    const { id } = data;
    const project = await prisma.project.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      select: {
        id: true,
        title: true,
        prompt: true,
        status: true,
        model: true,
      },
    });

    if (!project) {
      throw notFound();
    }

    const [chatRow] = await prisma.$queryRaw<[{ chatMessages: unknown }]>`
      SELECT "chatMessages" FROM "Project" WHERE id = ${project.id} AND "userId" = ${session.user.id}
    `;

    const [briefRow] = await prisma.$queryRaw<
      [{ brief: unknown; workspaceCard: unknown }]
    >`
      SELECT "brief", "workspaceCard" FROM "Project" WHERE id = ${project.id} AND "userId" = ${session.user.id}
    `;
    const initialBrief = parseProjectBrief(briefRow?.brief, project.prompt);

    const initialWorkspaceCard = parseWorkspaceCard(
      briefRow?.workspaceCard,
      initialBrief,
    );

    const initialChatPage = getProjectChatPage(
      parseProjectChatMessages(chatRow?.chatMessages),
      null,
      4,
    );

    // UIMessage.metadata is typed `unknown`, which the server-fn serialization
    // validator cannot prove serializable. The messages are DB-sourced JSON and
    // round-trip cleanly, so we cross the boundary as a JSON string and rehydrate
    // in the component — keeping strong typing on both ends without a lossy cast.
    return {
      initialBriefJson: JSON.stringify(initialBrief),
      initialChatCursor: initialChatPage.nextCursor,
      initialChatHasMore: initialChatPage.hasMore,
      initialMessagesJson: JSON.stringify(initialChatPage.messages),
      initialPrompt: project.prompt,
      initialStatus: project.status,
      initialTitle: project.title,
      initialWorkspaceCardJson: JSON.stringify(initialWorkspaceCard),
      projectId: project.id,
    };
  });

export const Route = createFileRoute("/_main/projects/$id")({
  loader: ({ params }) => loadProject({ data: { id: params.id } }),
  component: ProjectPage,
});

function ProjectPage() {
  const data = Route.useLoaderData();
  const initialMessages = JSON.parse(data.initialMessagesJson) as UIMessage[];
  const initialWorkspaceCard = JSON.parse(
    data.initialWorkspaceCardJson,
  ) as WorkspaceCard;
  const initialBrief = JSON.parse(data.initialBriefJson) as ProjectBrief;

  return (
    <>
      <ClearProjectDraft />
      <FirstBuildModal projectId={data.projectId} />
      <KopiFab variant="workspace" />
      <WorkspaceShell
        projectId={data.projectId}
        initialTitle={data.initialTitle}
        initialPrompt={data.initialPrompt}
        initialStatus={data.initialStatus}
        initialMessages={initialMessages}
        initialChatCursor={data.initialChatCursor}
        initialChatHasMore={data.initialChatHasMore}
        initialWorkspaceCard={initialWorkspaceCard}
        initialBrief={initialBrief}
      />
    </>
  );
}

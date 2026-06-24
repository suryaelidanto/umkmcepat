import { notFound, redirect } from "next/navigation";

import { ClearProjectDraft } from "@/components/projects/ClearProjectDraft";
import { WorkspaceShell } from "@/components/projects/WorkspaceShell";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseProjectBrief } from "@/lib/projects/brief";
import { getNextWorkspaceCard } from "@/lib/projects/brief-flow";
import {
  getProjectChatPage,
  parseProjectChatMessages,
} from "@/lib/projects/chat-memory";
import { parseProjectSiteSchema } from "@/lib/projects/site-schema";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const { id } = await params;
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
      siteSchema: true,
    },
  });

  if (!project) {
    notFound();
  }

  const [chatRow] = await prisma.$queryRaw<[{ chatMessages: unknown }]>`
    SELECT "chatMessages" FROM "Project" WHERE id = ${project.id} AND "userId" = ${session.user.id}
  `;

  const [briefRow] = await prisma.$queryRaw<[{ brief: unknown }]>`
    SELECT "brief" FROM "Project" WHERE id = ${project.id} AND "userId" = ${session.user.id}
  `;
  const initialBrief = parseProjectBrief(briefRow?.brief, project.prompt);

  const initialChatPage = getProjectChatPage(
    parseProjectChatMessages(chatRow?.chatMessages),
    null,
    4,
  );

  return (
    <>
      <ClearProjectDraft />
      <WorkspaceShell
        projectId={project.id}
        initialTitle={project.title}
        initialPrompt={project.prompt}
        initialStatus={project.status}
        initialMessages={initialChatPage.messages}
        initialChatCursor={initialChatPage.nextCursor}
        initialChatHasMore={initialChatPage.hasMore}
        initialWorkspaceCard={getNextWorkspaceCard(initialBrief)}
        siteSchema={parseProjectSiteSchema(
          (project as { siteSchema?: unknown }).siteSchema,
          project.prompt,
        )}
      />
    </>
  );
}

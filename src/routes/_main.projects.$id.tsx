import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import type { ProjectBrief, WorkspaceCard } from "@/lib/projects/brief";
import type { UIMessage } from "ai";

import { ClearProjectDraft } from "@/components/projects/ClearProjectDraft";
import { WorkspaceShell } from "@/components/projects/WorkspaceShell";
import { loadProjectForViewer } from "@/lib/admin-project-observer";
import { auth } from "@/lib/auth";

const loadProject = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const session = await auth();

    if (!session?.user?.id) {
      throw redirect({ to: "/" });
    }

    const result = await loadProjectForViewer({
      projectId: data.id,
      viewer: { email: session.user.email, id: session.user.id },
    });

    if (result.mode === "denied") {
      throw notFound();
    }

    return {
      mode: result.mode,
      projectJson: JSON.stringify(result.project),
    };
  });

export const Route = createFileRoute("/_main/projects/$id")({
  loader: ({ params }) => loadProject({ data: { id: params.id } }),
  component: ProjectPage,
});

function ProjectPage() {
  const data = Route.useLoaderData();
  const project = JSON.parse(data.projectJson);

  const readOnly = data.mode === "observer";
  const initialMessages = project.initialChatPage.messages as UIMessage[];
  const initialWorkspaceCard = project.initialWorkspaceCard as WorkspaceCard;
  const initialBrief = project.initialBrief as ProjectBrief;

  return (
    <>
      {readOnly ? null : <ClearProjectDraft />}
      <WorkspaceShell
        projectId={project.projectId}
        initialTitle={project.title}
        initialPrompt={project.initialPrompt}
        initialStatus={project.status}
        initialMessages={initialMessages}
        initialChatCursor={project.initialChatPage.nextCursor}
        initialChatHasMore={project.initialChatPage.hasMore}
        initialWorkspaceCard={initialWorkspaceCard}
        initialBrief={initialBrief}
        readOnly={readOnly}
      />
    </>
  );
}

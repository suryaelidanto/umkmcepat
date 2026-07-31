import { prisma } from "./prisma";
import { parseProjectBrief } from "./projects/brief";
import { parseWorkspaceCard } from "./projects/brief-flow";
import {
  CHAT_PAGE_SIZE,
  getProjectChatPage,
  parseProjectChatMessages,
} from "./projects/chat-memory";
import { isAdminEmail as defaultIsAdminEmail } from "./waitlist";

import type { ProjectBrief, WorkspaceCard } from "@/lib/projects/brief";
import type { UIMessage } from "ai";

type ProjectViewerRow = {
  brief: unknown;
  buildStatus: string;
  chatMessages: unknown;
  createdAt: Date;
  id: string;
  prompt: string;
  status: string;
  title: string;
  updatedAt: Date;
  user: { email: string | null; id: string; name: string | null };
  userId: string;
  workspaceCard: unknown;
};

type ProjectViewerClient = {
  project: {
    findUnique(args: {
      select: {
        brief: true;
        buildStatus: true;
        chatMessages: true;
        createdAt: true;
        id: true;
        prompt: true;
        status: true;
        title: true;
        updatedAt: true;
        user: { select: { email: true; id: true; name: true } };
        userId: true;
        workspaceCard: true;
      };
      where: { id: string };
    }): Promise<ProjectViewerRow | null>;
  };
};

export type ProjectViewerData = {
  buildStatus: string;
  createdAt: string;
  initialBrief: ProjectBrief;
  initialChatPage: {
    hasMore: boolean;
    messages: UIMessage[];
    nextCursor: number | null;
  };
  initialPrompt: string;
  initialWorkspaceCard: WorkspaceCard;
  owner: { email: string | null; id: string; name: string | null };
  projectId: string;
  status: string;
  title: string;
  updatedAt: string;
};

export type ProjectViewerLoad =
  | { mode: "owner"; project: ProjectViewerData }
  | { mode: "observer"; project: ProjectViewerData }
  | { mode: "denied"; project: null };

export async function loadProjectForViewer({
  client = prisma,
  isAdminEmail = defaultIsAdminEmail,
  projectId,
  viewer,
}: {
  client?: ProjectViewerClient;
  isAdminEmail?: (email: string) => boolean;
  projectId: string;
  viewer: { email?: string | null; id: string };
}): Promise<ProjectViewerLoad> {
  const project = await client.project.findUnique({
    select: {
      brief: true,
      buildStatus: true,
      chatMessages: true,
      createdAt: true,
      id: true,
      prompt: true,
      status: true,
      title: true,
      updatedAt: true,
      user: { select: { email: true, id: true, name: true } },
      userId: true,
      workspaceCard: true,
    },
    where: { id: projectId },
  });

  if (!project) {
    return { mode: "denied", project: null };
  }

  const data = toProjectViewerData(project);

  if (project.userId === viewer.id) {
    return { mode: "owner", project: data };
  }

  if (viewer.email && isAdminEmail(viewer.email)) {
    return { mode: "observer", project: data };
  }

  return { mode: "denied", project: null };
}

function toProjectViewerData(project: ProjectViewerRow): ProjectViewerData {
  const initialBrief = parseProjectBrief(project.brief, project.prompt);
  return {
    buildStatus: project.buildStatus,
    createdAt: project.createdAt.toISOString(),
    initialBrief,
    initialChatPage: getProjectChatPage(
      parseProjectChatMessages(project.chatMessages),
      null,
      CHAT_PAGE_SIZE,
    ),
    initialPrompt: project.prompt,
    initialWorkspaceCard: parseWorkspaceCard(
      project.workspaceCard,
      initialBrief,
    ),
    owner: project.user,
    projectId: project.id,
    status: project.status,
    title: project.title,
    updatedAt: project.updatedAt.toISOString(),
  };
}

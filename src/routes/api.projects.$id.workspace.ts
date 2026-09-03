import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import { isPrismaDatabaseUnavailable } from "@/lib/prisma-errors";
import {
  groundProjectBriefToOwnerFacts,
  parseProjectBrief,
} from "@/lib/projects/brief";
import { parseWorkspaceCard } from "@/lib/projects/brief-flow";
import { parseCanonicalBrief } from "@/lib/projects/canonical-brief";
import {
  getTextFromUIMessage,
  parseProjectChatMessages,
} from "@/lib/projects/chat-memory";
import { isAdminEmail } from "@/lib/waitlist/waitlist";

export const Route = createFileRoute("/api/projects/$id/workspace")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const session = await auth();

        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const { id } = params;
        const admin = isAdminEmail(session.user.email ?? "");
        const project = await prisma.project.findFirst({
          where: { id, ...(admin ? {} : { userId: session.user.id }) },
          select: {
            id: true,
            prompt: true,
            title: true,
          },
        });

        if (!project) {
          return Response.json(
            { message: "Proyek tidak ditemukan." },
            { status: 404 },
          );
        }

        let workspaceRow:
          | { brief: unknown; workspaceCard: unknown; chatMessages: unknown }
          | undefined;

        try {
          [workspaceRow] = await prisma.$queryRaw<
            [{ brief: unknown; workspaceCard: unknown; chatMessages: unknown }]
          >`
            SELECT "brief", "workspaceCard", "chatMessages" FROM "Project" WHERE id = ${project.id}
          `;
        } catch (error) {
          if (isPrismaDatabaseUnavailable(error)) {
            return Response.json(
              {
                code: "database_unavailable",
                message:
                  "Workspace lagi nyambung ulang. Coba lagi sebentar ya.",
              },
              { status: 503, headers: { "Retry-After": "3" } },
            );
          }

          throw error;
        }
        const brief = groundProjectBriefToOwnerFacts(
          parseProjectBrief(
            parseCanonicalBrief(workspaceRow?.brief, project.prompt),
            project.prompt,
          ),
          {
            ownerTexts: parseProjectChatMessages(workspaceRow?.chatMessages)
              .filter((message) => message.role === "user")
              .map(getTextFromUIMessage),
          },
        );

        return Response.json({
          brief,
          projectId: project.id,
          projectTitle: project.title,
          workspaceCard: parseWorkspaceCard(workspaceRow?.workspaceCard, brief),
        });
      },
    },
  },
});

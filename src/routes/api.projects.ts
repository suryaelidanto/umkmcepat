import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { createFileRoute } from "@tanstack/react-router";

import { getDefaultAiModel } from "@/lib/ai-models";
import { moderateProjectRequest } from "@/lib/ai-moderation";
import { apiError } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { isBoundedJsonError, readBoundedJson } from "@/lib/bounded-json";
import { prisma } from "@/lib/prisma";
import { createInitialBrief } from "@/lib/projects/brief";
import { createPendingWorkspaceCard } from "@/lib/projects/brief-flow";
import { validateProjectRequest } from "@/lib/projects/input";
import {
  decodeProjectCursor,
  encodeProjectCursor,
  PROJECT_PAGE_SIZE,
} from "@/lib/projects/pagination";
import { getProjectTitle, type WorkspaceMode } from "@/lib/projects/workspace";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  assertUnderProjectLimit,
  chargeEnergyForAiUsage,
  checkEnergy,
  getProjectCount,
  getProjectLimit,
  isOverProjectLimit,
  MIN_ENERGY_MODERATION,
  ProjectLimitExceededError,
} from "@/lib/user-credits";

const CREATE_PROJECT_IDEMPOTENCY_ACTION = "project.create";
const IDEMPOTENCY_KEY_MAX_LENGTH = 120;

export const Route = createFileRoute("/api/projects")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth();

        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const rawCursor = new URL(request.url).searchParams.get("cursor");
        const cursor = rawCursor ? decodeProjectCursor(rawCursor) : null;

        if (rawCursor && !cursor) {
          return Response.json(
            { code: "invalid_cursor", message: "Cursor proyek tidak valid." },
            { status: 400 },
          );
        }

        const projects = await prisma.project.findMany({
          where: {
            userId: session.user.id,
            ...(cursor
              ? {
                  OR: [
                    { updatedAt: { lt: cursor.updatedAt } },
                    { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
                  ],
                }
              : {}),
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: PROJECT_PAGE_SIZE + 1,
          select: {
            buildStatus: true,
            id: true,
            thumbnailBuildId: true,
            thumbnailRef: true,
            title: true,
            updatedAt: true,
          },
        });
        const hasMore = projects.length > PROJECT_PAGE_SIZE;
        const items = hasMore ? projects.slice(0, PROJECT_PAGE_SIZE) : projects;

        const lastItem = items.at(-1);
        const projectCount = await getProjectCount(session.user.id);
        const projectLimit = getProjectLimit();

        return Response.json({
          projects: items,
          nextCursor:
            hasMore && lastItem
              ? encodeProjectCursor({
                  id: lastItem.id,
                  updatedAt: lastItem.updatedAt,
                })
              : null,
          projectCount,
          projectLimit,
          overProjectLimit: isOverProjectLimit(projectCount, projectLimit),
        });
      },
      POST: async ({ request }) => {
        const session = await auth();

        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const userId = session.user.id;
        const rateLimitResponse = await checkRateLimit(
          request,
          "ai",
          userId,
        ).catch(() =>
          apiError({
            code: "rate_limit_unavailable",
            message:
              "Sistem pembatasan request belum siap. Coba lagi sebentar.",
            status: 503,
          }),
        );

        if (rateLimitResponse) {
          return rateLimitResponse;
        }

        const energy = await checkEnergy(userId, MIN_ENERGY_MODERATION);
        if (!energy.allowed) {
          return Response.json(
            {
              code: "energy_exhausted",
              message: "Energi harian habis. Coba lagi besok.",
              remaining: energy.remaining,
            },
            { status: 429 },
          );
        }

        let body: {
          idempotencyKey?: string;
          mode?: WorkspaceMode;
          prompt?: string;
        };

        try {
          body = (await readBoundedJson(request, {
            maxBytes: 16 * 1024,
          })) as typeof body;
        } catch (error) {
          if (isBoundedJsonError(error)) {
            return Response.json(
              {
                code: error.code,
                message:
                  error.code === "request_body_too_large"
                    ? "Permintaan terlalu besar. Ringkas dulu, ya."
                    : "Format permintaan belum valid.",
              },
              { status: error.code === "request_body_too_large" ? 413 : 400 },
            );
          }

          throw error;
        }
        const { prompt } = body;
        const mode = body.mode === "build" ? "build" : "discuss";
        const validation = validateProjectRequest(prompt ?? "");
        const idempotencyKey = getIdempotencyKey(request, body.idempotencyKey);

        if (!validation.ok) {
          return Response.json(
            { message: validation.message },
            { status: 400 },
          );
        }

        const existingProject = idempotencyKey
          ? await findIdempotentProject(userId, idempotencyKey)
          : null;

        if (existingProject) {
          return Response.json({
            id: existingProject.id,
            path: `/projects/${existingProject.id}`,
          });
        }

        let moderation;
        try {
          moderation = await moderateProjectRequest(validation.value);
        } catch (error) {
          console.error(
            "[moderation] failed:",
            error instanceof Error ? error.message : error,
          );
          return apiError({
            code: "moderation_unavailable",
            message: "Pemeriksaan keamanan belum berhasil. Coba lagi sebentar.",
            retryAfter: 3,
            status: 503,
          });
        }

        if (moderation.usage) {
          await chargeEnergyForAiUsage({
            userId,
            modelId: moderation.modelId || "umkmcepat-combo",
            inputTokens: moderation.usage.inputTokens,
            outputTokens: moderation.usage.outputTokens,
            reason: "moderation",
          });
        }

        if (!moderation.allowed) {
          return Response.json(
            {
              code: "project_request_blocked",
              message: moderation.message || "Permintaan belum bisa diproses.",
            },
            { status: 400 },
          );
        }

        const brief = createInitialBrief(validation.value);
        const workspaceCard = createPendingWorkspaceCard(brief);
        let project: { id: string } | null;

        try {
          project = await createProjectOnce({
            brief,
            idempotencyKey,
            mode,
            prompt: validation.value,
            sessionUserId: userId,
            workspaceCard,
          });
        } catch (error) {
          if (error instanceof ProjectLimitExceededError) {
            return Response.json(
              {
                code: "project_limit_exceeded",
                message: `Kamu sudah punya ${error.count} website (batas ${error.limit}). Hapus yang tidak terpakai dulu.`,
                projectCount: error.count,
                projectLimit: error.limit,
              },
              { status: 403 },
            );
          }
          if (idempotencyKey) {
            project = await findIdempotentProject(userId, idempotencyKey);
          } else {
            throw error;
          }
        }

        if (!project) {
          return apiError({
            code: "project_create_unavailable",
            message: "Proyek belum bisa dibuat. Coba lagi sebentar.",
            status: 503,
          });
        }

        return Response.json({
          id: project.id,
          path: `/projects/${project.id}`,
          projectCount: await getProjectCount(userId),
          projectLimit: getProjectLimit(),
        });
      },
    },
  },
});

function getIdempotencyKey(request: Request, bodyKey?: string) {
  const value = (
    request.headers.get("Idempotency-Key") ||
    bodyKey ||
    ""
  ).trim();

  if (!value || value.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    return "";
  }

  return /^[A-Za-z0-9._:-]+$/.test(value) ? value : "";
}

async function findIdempotentProject(userId: string, key: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT p."id"
    FROM "ProjectIdempotencyKey" k
    JOIN "Project" p ON p."id" = k."projectId"
    WHERE k."userId" = ${userId}
      AND k."action" = ${CREATE_PROJECT_IDEMPOTENCY_ACTION}
      AND k."key" = ${key}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function createProjectOnce({
  brief,
  idempotencyKey,
  mode,
  prompt,
  sessionUserId,
  workspaceCard,
}: {
  brief: unknown;
  idempotencyKey: string;
  mode: WorkspaceMode;
  prompt: string;
  sessionUserId: string;
  workspaceCard: unknown;
}) {
  // Atomic: the COUNT(*) inside assertUnderProjectLimit and the project
  // insert run in the same transaction, so two concurrent POSTs can't
  // both observe count=limit and both create a 4th row.
  try {
    return await prisma.$transaction(async (tx) => {
      await assertUnderProjectLimit(tx, sessionUserId);

      const project = await tx.project.create({
        data: createProjectData({
          brief,
          mode,
          prompt,
          sessionUserId,
          workspaceCard,
        }),
        select: { id: true },
      });

      if (idempotencyKey) {
        const idempotencyRecordId = `idem_${randomUUID().replace(/-/g, "")}`;
        await tx.$executeRaw`
          INSERT INTO "ProjectIdempotencyKey" (
            "id",
            "userId",
            "projectId",
            "action",
            "key",
            "createdAt"
          ) VALUES (
            ${idempotencyRecordId},
            ${sessionUserId},
            ${project.id},
            ${CREATE_PROJECT_IDEMPOTENCY_ACTION},
            ${idempotencyKey},
            NOW()
          )
        `;
      }

      return project;
    });
  } catch (error) {
    // P2002: another request won the idempotency race → return the
    // existing project, same as before.
    if (isUniqueConstraintError(error) && idempotencyKey) {
      const project = await findIdempotentProject(
        sessionUserId,
        idempotencyKey,
      );

      if (project) {
        return project;
      }
    }

    throw error;
  }
}

function createProjectData({
  brief,
  mode,
  prompt,
  sessionUserId,
  workspaceCard,
}: {
  brief: unknown;
  mode: WorkspaceMode;
  prompt: string;
  sessionUserId: string;
  workspaceCard: unknown;
}) {
  return {
    title: getProjectTitle(prompt),
    prompt,
    model: getDefaultAiModel(),
    status: mode === "build" ? "draft" : "discussing",
    brief: brief as Prisma.InputJsonValue,
    workspaceCard: workspaceCard as Prisma.InputJsonValue,
    userId: sessionUserId,
  };
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

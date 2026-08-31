import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { createFileRoute } from "@tanstack/react-router";

import { getDefaultAiModel, getModerationModel } from "@/lib/ai/ai-models";
import {
  moderateProjectRequest,
  type ModerationImage,
} from "@/lib/ai/ai-moderation";
import { apiError } from "@/lib/api-errors";
import { auth } from "@/lib/auth/auth";
import { getSetting } from "@/lib/config/app-settings";
import { checkMaintenanceGate } from "@/lib/config/maintenance-mode";
import {
  assertUnderProjectLimit,
  chargeEnergyForAiUsage,
  checkEnergy,
  getEnergyConfig,
  getProjectCount,
  getProjectLimit,
  isAtOrOverProjectLimit,
  ProjectLimitExceededError,
} from "@/lib/payment/user-credits";
import { prisma } from "@/lib/prisma";
import { createInitialBrief } from "@/lib/projects/brief";
import { createFallbackWorkspaceCard } from "@/lib/projects/brief-flow";
import {
  resolveGenerationEngine,
  type GenerationEngine,
} from "@/lib/projects/generation-engine";
import { validateProjectRequest } from "@/lib/projects/input";
import {
  decodeProjectCursor,
  encodeProjectCursor,
  PROJECT_PAGE_SIZE,
} from "@/lib/projects/pagination";
import { uploadProjectAsset } from "@/lib/projects/project-asset-upload";
import { getProjectTitle, type WorkspaceMode } from "@/lib/projects/workspace";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  contentTypeFromExt,
  detectImageFormat,
} from "@/lib/storage/images/format";
import {
  claimTempImage,
  readTempImage,
} from "@/lib/storage/uploads/temp-image-storage";
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

        try {
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
              thumbnailUpdatedAt: true,
              title: true,
              updatedAt: true,
            },
          });
          const hasMore = projects.length > PROJECT_PAGE_SIZE;
          const items = hasMore
            ? projects.slice(0, PROJECT_PAGE_SIZE)
            : projects;

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
            overProjectLimit: isAtOrOverProjectLimit(
              projectCount,
              projectLimit,
            ),
          });
        } catch (error) {
          console.warn(
            "[api.projects] DB unavailable - returning degraded 503:",
            error instanceof Error ? error.message : error,
          );
          return Response.json(
            {
              code: "database_unavailable",
              message: "Database sedang tidak tersedia. Coba lagi sebentar.",
            },
            { status: 503 },
          );
        }
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
        const maintenance = await checkMaintenanceGate(session.user.email);
        if (!maintenance.allowed) {
          return maintenance.response;
        }

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

        const energy = await checkEnergy(
          userId,
          getEnergyConfig().minModeration,
        );
        if (!energy.allowed) {
          return Response.json(
            {
              code: "energy_exhausted",
              message: "Energi kamu sudah habis. Tambah energi untuk lanjut.",
              remaining: energy.remaining,
            },
            { status: 429 },
          );
        }

        const form = await request.formData().catch(() => null);
        if (!form) {
          return Response.json(
            { message: "Permintaan tidak valid." },
            { status: 400 },
          );
        }

        const uploadsEnabled = await getSetting(
          "feature.composer_uploads_enabled",
          true,
        );
        if (!uploadsEnabled) {
          for (const key of Array.from(form.keys())) {
            if (key === "assetIds" || key === "files") {
              form.delete(key);
            }
          }
        }

        const prompt = String(form.get("prompt") ?? "").trim();
        const mode = form.get("mode") === "build" ? "build" : "discuss";
        const idempotencyKey = getIdempotencyKeyFromForm(form);
        const validation = validateProjectRequest(prompt);

        if (!validation.ok) {
          return Response.json(
            { message: validation.message },
            { status: 400 },
          );
        }

        const tempAssetIds = form
          .getAll("assetIds")
          .filter((value): value is string => typeof value === "string");
        const rawFiles = form
          .getAll("files")
          .filter((f): f is File => f instanceof File);
        if (rawFiles.length + tempAssetIds.length > 6) {
          return Response.json(
            { message: "Maksimal 6 gambar." },
            { status: 400 },
          );
        }

        const imageParts: ModerationImage[] = [];
        const validatedFiles: { bytes: Buffer; contentType: string }[] = [];
        for (const file of rawFiles) {
          if (file.size > 5 * 1024 * 1024) {
            return Response.json(
              { message: "Ukuran file melebihi 5 MB." },
              { status: 413 },
            );
          }
          const bytes = Buffer.from(await file.arrayBuffer());
          const format = detectImageFormat(bytes);
          if (!format) {
            return Response.json(
              {
                message:
                  "Format gambar tidak didukung. Gunakan PNG, JPEG, atau WEBP.",
              },
              { status: 400 },
            );
          }
          const contentType = contentTypeFromExt(format);
          imageParts.push({ bytes, mediaType: contentType });
          validatedFiles.push({ bytes, contentType });
        }

        const existingProject = idempotencyKey
          ? await findIdempotentProject(userId, idempotencyKey)
          : null;
        if (existingProject) {
          return Response.json({
            assetIds: [],
            id: existingProject.id,
            path: `/projects/${existingProject.id}`,
          });
        }

        for (const tempAssetId of tempAssetIds) {
          try {
            const tempImage = await readTempImage(userId, tempAssetId);
            imageParts.push({
              bytes: tempImage.body,
              mediaType: tempImage.contentType,
            });
          } catch {
            return Response.json(
              { code: "invalid_image", message: "Gambar tidak valid." },
              { status: 400 },
            );
          }
        }

        try {
          const moderation = await moderateProjectRequest(
            validation.value,
            imageParts,
          );
          if (moderation.usage) {
            await chargeEnergyForAiUsage({
              userId,
              modelId: moderation.modelId || getModerationModel(),
              inputTokens: moderation.usage.inputTokens,
              outputTokens: moderation.usage.outputTokens,
              reason: "moderation",
            });
          }
          if (!moderation.allowed) {
            return Response.json(
              {
                code: "project_request_blocked",
                message:
                  moderation.message || "Permintaan belum bisa diproses.",
              },
              { status: 400 },
            );
          }
        } catch (error) {
          console.error("[moderation] api.projects failed", {
            error: error instanceof Error ? error.message : error,
          });
          return Response.json(
            {
              code: "moderation_unavailable",
              message:
                "Pemeriksaan keamanan belum berhasil. Coba lagi sebentar.",
              retryAfter: 3,
            },
            { status: 503 },
          );
        }

        const brief = createInitialBrief(validation.value);
        const workspaceCard = createFallbackWorkspaceCard(brief);
        const generationEngine = resolveGenerationEngine();
        let project: { id: string } | null;
        try {
          project = await createProjectOnce({
            brief,
            generationEngine,
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

        const assetIds: string[] = [];
        for (const tempAssetId of tempAssetIds) {
          const claimed = await claimTempImage(userId, tempAssetId);
          const asset = await uploadProjectAsset({
            bytes: claimed.body,
            projectId: project.id,
            purpose: "business-image",
            userId,
          });
          assetIds.push(asset.id);
        }
        for (const f of validatedFiles) {
          const asset = await uploadProjectAsset({
            bytes: f.bytes,
            projectId: project.id,
            purpose: "business-image",
            userId,
          });
          assetIds.push(asset.id);
        }

        return Response.json({
          assetIds,
          id: project.id,
          path: `/projects/${project.id}`,
          projectCount: await getProjectCount(userId),
          projectLimit: getProjectLimit(),
        });
      },
    },
  },
});

function getIdempotencyKeyFromForm(form: FormData) {
  const value = String(form.get("idempotencyKey") ?? "").trim();
  if (!value || value.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    return "";
  }
  return /^[A-Za-z0-9._:-]+$/.test(value) ? value : "";
}

export function getIdempotencyKey(request: Request, bodyKey?: string) {
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
  generationEngine,
  idempotencyKey,
  mode,
  prompt,
  sessionUserId,
  workspaceCard,
}: {
  brief: unknown;
  generationEngine: GenerationEngine;
  idempotencyKey: string;
  mode: WorkspaceMode;
  prompt: string;
  sessionUserId: string;
  workspaceCard: unknown;
}) {
  // Atomic: the COUNT(*) inside assertUnderProjectLimit and the project
  try {
    return await prisma.$transaction(async (tx) => {
      await assertUnderProjectLimit(tx, sessionUserId);

      const project = await tx.project.create({
        data: createProjectData({
          brief,
          generationEngine,
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
  generationEngine,
  mode,
  prompt,
  sessionUserId,
  workspaceCard,
}: {
  brief: unknown;
  generationEngine: GenerationEngine;
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
    generationEngine,
    userId: sessionUserId,
  };
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

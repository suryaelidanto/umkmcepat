import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

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
import { createFallbackProjectSiteSchema } from "@/lib/projects/site-schema";
import { getProjectTitle, type WorkspaceMode } from "@/lib/projects/workspace";
import { checkRateLimit } from "@/lib/rate-limit";

const CREATE_PROJECT_IDEMPOTENCY_ACTION = "project.create";
const IDEMPOTENCY_KEY_MAX_LENGTH = 120;

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  const rawCursor = new URL(request.url).searchParams.get("cursor");
  const cursor = rawCursor ? decodeProjectCursor(rawCursor) : null;

  if (rawCursor && !cursor) {
    return NextResponse.json(
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

  return NextResponse.json({
    projects: items,
    nextCursor:
      hasMore && lastItem
        ? encodeProjectCursor({
            id: lastItem.id,
            updatedAt: lastItem.updatedAt,
          })
        : null,
  });
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  const userId = session.user.id;
  const rateLimitResponse = await checkRateLimit(request, "ai", userId).catch(
    () =>
      apiError({
        code: "rate_limit_unavailable",
        message: "Sistem pembatasan request belum siap. Coba lagi sebentar.",
        status: 503,
      }),
  );

  if (rateLimitResponse) {
    return rateLimitResponse;
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
      return NextResponse.json(
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
    return NextResponse.json({ message: validation.message }, { status: 400 });
  }

  const existingProject = idempotencyKey
    ? await findIdempotentProject(userId, idempotencyKey)
    : null;

  if (existingProject) {
    return NextResponse.json({
      id: existingProject.id,
      path: `/projects/${existingProject.id}`,
    });
  }

  const moderation = await moderateProjectRequest(validation.value).catch(
    () => ({ allowed: true as const }),
  );

  if (!moderation.allowed) {
    return NextResponse.json(
      {
        code: "project_request_blocked",
        message: moderation.message || "Permintaan belum bisa diproses.",
      },
      { status: 400 },
    );
  }

  const siteSchema = createFallbackProjectSiteSchema(validation.value);
  const brief = createInitialBrief(validation.value);
  const workspaceCard = createPendingWorkspaceCard(brief);
  const project = await createProjectOnce({
    brief,
    idempotencyKey,
    mode,
    prompt: validation.value,
    sessionUserId: userId,
    siteSchema,
    workspaceCard,
  }).catch(async () =>
    idempotencyKey ? findIdempotentProject(userId, idempotencyKey) : null,
  );

  if (!project) {
    return apiError({
      code: "project_create_unavailable",
      message: "Proyek belum bisa dibuat. Coba lagi sebentar.",
      status: 503,
    });
  }

  return NextResponse.json({ id: project.id, path: `/projects/${project.id}` });
}

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
  siteSchema,
  workspaceCard,
}: {
  brief: unknown;
  idempotencyKey: string;
  mode: WorkspaceMode;
  prompt: string;
  sessionUserId: string;
  siteSchema: unknown;
  workspaceCard: unknown;
}) {
  if (!idempotencyKey) {
    return prisma.project.create({
      data: createProjectData({
        brief,
        mode,
        prompt,
        sessionUserId,
        siteSchema,
        workspaceCard,
      }),
      select: { id: true },
    });
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const idempotencyRecordId = `idem_${randomUUID().replace(/-/g, "")}`;
      const project = await tx.project.create({
        data: createProjectData({
          brief,
          mode,
          prompt,
          sessionUserId,
          siteSchema,
          workspaceCard,
        }),
        select: { id: true },
      });

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

      return project;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
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
  siteSchema,
  workspaceCard,
}: {
  brief: unknown;
  mode: WorkspaceMode;
  prompt: string;
  sessionUserId: string;
  siteSchema: unknown;
  workspaceCard: unknown;
}) {
  return {
    title: getProjectTitle(prompt),
    prompt,
    model: getDefaultAiModel(),
    status: mode === "build" ? "draft" : "discussing",
    siteSchema: siteSchema as Prisma.InputJsonValue,
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

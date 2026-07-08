import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getDefaultAiModel } from "@/lib/ai-models";
import { moderateProjectRequest } from "@/lib/ai-moderation";
import { apiError } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createInitialBrief } from "@/lib/projects/brief";
import { createPendingWorkspaceCard } from "@/lib/projects/brief-flow";
import { validateProjectRequest } from "@/lib/projects/input";
import { PROJECT_PAGE_SIZE } from "@/lib/projects/pagination";
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

  const cursor = new URL(request.url).searchParams.get("cursor");
  const projects = await prisma.project.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    take: PROJECT_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, title: true, updatedAt: true },
  });
  const hasMore = projects.length > PROJECT_PAGE_SIZE;
  const items = hasMore ? projects.slice(0, PROJECT_PAGE_SIZE) : projects;

  return NextResponse.json({
    projects: items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
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

  const body = (await request.json().catch(() => ({}))) as {
    idempotencyKey?: string;
    mode?: WorkspaceMode;
    prompt?: string;
  };
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
    () => null,
  );

  if (!moderation) {
    return apiError({
      code: "project_create_ai_unavailable",
      message: "AI sedang sibuk memeriksa permintaan. Coba lagi sebentar.",
      status: 503,
    });
  }

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
  const record = await prisma.projectIdempotencyKey.findUnique({
    where: {
      userId_action_key: {
        action: CREATE_PROJECT_IDEMPOTENCY_ACTION,
        key,
        userId,
      },
    },
    select: { project: { select: { id: true } } },
  });

  return record?.project ?? null;
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

      await tx.projectIdempotencyKey.create({
        data: {
          action: CREATE_PROJECT_IDEMPOTENCY_ACTION,
          key: idempotencyKey,
          projectId: project.id,
          userId: sessionUserId,
        },
      });

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
    siteSchema,
    brief,
    workspaceCard,
    userId: sessionUserId,
  } as Parameters<typeof prisma.project.create>[0]["data"];
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

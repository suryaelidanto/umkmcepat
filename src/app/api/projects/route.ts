import { NextResponse } from "next/server";

import { getDefaultAiModel } from "@/lib/ai-models";
import { moderateProjectRequest } from "@/lib/ai-moderation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createInitialBrief } from "@/lib/projects/brief";
import { createPendingWorkspaceCard } from "@/lib/projects/brief-flow";
import { validateProjectRequest } from "@/lib/projects/input";
import { PROJECT_PAGE_SIZE } from "@/lib/projects/pagination";
import { createFallbackProjectSiteSchema } from "@/lib/projects/site-schema";
import { getProjectTitle, type WorkspaceMode } from "@/lib/projects/workspace";
import { checkRateLimit } from "@/lib/rate-limit";

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

  const rateLimitResponse = await checkRateLimit(
    request,
    "ai",
    session.user.id,
  );

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const body = (await request.json().catch(() => ({}))) as {
    mode?: WorkspaceMode;
    prompt?: string;
  };
  const { prompt } = body;
  const mode = body.mode === "build" ? "build" : "discuss";
  const validation = validateProjectRequest(prompt ?? "");

  if (!validation.ok) {
    return NextResponse.json({ message: validation.message }, { status: 400 });
  }

  const moderation = await moderateProjectRequest(validation.value);

  if (!moderation.allowed) {
    return NextResponse.json(
      { message: moderation.message || "Permintaan belum bisa diproses." },
      { status: 400 },
    );
  }

  const siteSchema = createFallbackProjectSiteSchema(validation.value);
  const brief = createInitialBrief(validation.value);
  const workspaceCard = createPendingWorkspaceCard(brief);
  const project = await prisma.project.create({
    data: {
      title: getProjectTitle(validation.value),
      prompt: validation.value,
      model: getDefaultAiModel(),
      status: mode === "build" ? "draft" : "discussing",
      siteSchema,
      brief,
      workspaceCard,
      userId: session.user.id,
    } as Parameters<typeof prisma.project.create>[0]["data"],
    select: { id: true },
  });

  return NextResponse.json({ id: project.id, path: `/projects/${project.id}` });
}

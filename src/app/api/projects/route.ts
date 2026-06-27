import { NextResponse } from "next/server";

import { getDefaultAiModel } from "@/lib/ai-models";
import { moderateProjectRequest } from "@/lib/ai-moderation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createInitialBrief } from "@/lib/projects/brief";
import { createPendingWorkspaceCard } from "@/lib/projects/brief-flow";
import { validateProjectRequest } from "@/lib/projects/input";
import { createFallbackProjectSiteSchema } from "@/lib/projects/site-schema";
import { getProjectTitle, type WorkspaceMode } from "@/lib/projects/workspace";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  const rateLimitResponse = await checkRateLimit(request, "ai");

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

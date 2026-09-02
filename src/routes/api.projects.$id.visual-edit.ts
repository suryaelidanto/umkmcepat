import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import { isBoundedJsonError, readBoundedJson } from "@/lib/bounded-json";
import { getSetting } from "@/lib/config/app-settings";
import { isGeneratedBuildExecutionEnabled } from "@/lib/config/config";
import { devLog } from "@/lib/dev-log";
import { checkEnergy, getEnergyConfig } from "@/lib/payment/user-credits";
import { prisma } from "@/lib/prisma";
import { enqueueAttemptJob } from "@/lib/projects/attempt-queue";
import { createReadStreamFromChannel } from "@/lib/projects/build-attempt-pubsub";
import { parseCanonicalBrief } from "@/lib/projects/canonical-brief";
import { hashCanonicalBriefContent } from "@/lib/projects/canonical-brief-hash";
import { resolveProjectChatState } from "@/lib/projects/chat-memory";
import {
  isProjectDeploymentForProject,
  selectActivePreviewDeployment,
} from "@/lib/projects/deployment-resolution";
import { classifyEditIntent } from "@/lib/projects/edit-intent";
import { createEditPlan, type EditPlan } from "@/lib/projects/edit-plan";
import { classifyEditStructure } from "@/lib/projects/edit-structure";
import { parseGeneratedProjectFiles } from "@/lib/projects/generated-source";
import {
  claimProjectOperation,
  finalizeProjectOperation,
} from "@/lib/projects/project-operation";
import {
  isProjectArtifactRefFor,
  readProjectSourceArtifact,
} from "@/lib/projects/runtime-artifacts";
import { markStaleProjectBuilds } from "@/lib/projects/stale-builds";
import { sanitizeVisualAnnotations } from "@/lib/projects/visual-annotations";
import { checkRateLimit } from "@/lib/rate-limit";

type EditRequest = {
  annotations?: unknown;
  instruction?: string;
  kind?: string;
  summary?: string;
};

export const Route = createFileRoute("/api/projects/$id/visual-edit")({
  server: {
    handlers: {
      POST: ({ request, params }) => handleVisualEditPost(request, params.id),
    },
  },
});

export async function handleVisualEditPost(request: Request, routeId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  const visualEditEnabled = await getSetting(
    "feature.visual_edit_enabled",
    false,
  );
  if (!visualEditEnabled) {
    return new Response("Not Found", { status: 404 });
  }

  const userId = session.user.id;

  const rateLimitResponse = await checkRateLimit(request, "build", userId);

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const energy = await checkEnergy(userId, getEnergyConfig().minEdit);
  if (!energy.allowed) {
    return Response.json(
      {
        message: "Energi kamu sudah habis. Tambah energi untuk lanjut.",
        code: "energy_exhausted",
        remaining: energy.remaining,
      },
      { status: 429 },
    );
  }

  if (!isGeneratedBuildExecutionEnabled()) {
    return Response.json(
      {
        code: "generated_build_execution_unavailable",
        message:
          "Build baru sedang dinonaktifkan sementara. Tampilan terakhir tetap aman.",
      },
      { status: 503, headers: { "Retry-After": "30" } },
    );
  }

  let body: EditRequest;

  try {
    body = (await readBoundedJson(request, {
      maxBytes: 256 * 1024,
    })) as EditRequest;
  } catch (error) {
    if (isBoundedJsonError(error)) {
      return Response.json(
        {
          code: error.code,
          message:
            error.code === "request_body_too_large"
              ? "Instruksi edit terlalu besar. Ringkas komentarmu, ya."
              : "Format instruksi edit belum valid.",
        },
        { status: error.code === "request_body_too_large" ? 413 : 400 },
      );
    }

    throw error;
  }

  const id = routeId;
  devLog("visual-edit", "request", { projectId: id, userId: session.user.id });
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    select: {
      brief: true,
      buildStatus: true,
      chatMessages: true,
      chatSummary: true,
      generationEngine: true,
      id: true,
      memoryFacts: true,
      prompt: true,
      siteSchema: true,
      status: true,
    },
  });

  devLog("visual-edit", "project.loaded", {
    buildStatus: project?.buildStatus,
    projectId: id,
    status: project?.status,
  });

  if (!project) {
    return Response.json(
      { message: "Proyek tidak ditemukan." },
      { status: 404 },
    );
  }

  const instruction =
    typeof body.instruction === "string" ? body.instruction.trim() : "";
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  const annotations = sanitizeVisualAnnotations(body.annotations);
  const kind =
    body.kind === "visual_comment" ? "visual_comment" : "instruction";

  if (!instruction) {
    return Response.json(
      {
        code: "edit_instruction_required",
        message: "Instruksi edit belum valid.",
      },
      { status: 400 },
    );
  }

  const scopeIntent = classifyEditIntent({ instruction });
  if (scopeIntent.clarificationRequired) {
    return Response.json(
      {
        code: "edit_scope_clarification_required",
        message:
          "Sebutkan bagian, isi, foto, atau arah visual yang ingin kamu ubah.",
      },
      { status: 409 },
    );
  }

  // contract: structural edits (page/route/CTA/capability) require a new
  if (
    project.generationEngine === "contract" ||
    project.generationEngine === "contract-v1"
  ) {
    const structure = classifyEditStructure(instruction);
    if (structure.kind === "structural") {
      return Response.json(
        {
          code: "edit_requires_structural_handoff",
          message:
            "Perubahan ini mengubah struktur website. Simpan dulu rencana halaman baru untuk melanjutkan.",
        },
        { status: 409 },
      );
    }
  }

  if (instruction.length > 16_000 || summary.length > 8_000) {
    return Response.json(
      {
        code: "edit_instruction_too_large",
        message: "Instruksi edit terlalu panjang. Ringkas komentarmu, ya.",
      },
      { status: 413 },
    );
  }

  const deployments = await prisma.projectDeployment.findMany({
    where: { kind: "preview", projectId: project.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      build: {
        select: {
          artifactRef: true,
          createdAt: true,
          id: true,
          projectId: true,
          snapshot: { select: { id: true, projectId: true } },
          snapshotId: true,
          status: true,
          updatedAt: true,
        },
      },
      buildId: true,
      createdAt: true,
      id: true,
      kind: true,
      projectId: true,
      snapshot: {
        select: {
          files: true,
          id: true,
          projectId: true,
          sourceRef: true,
        },
      },
      snapshotId: true,
      status: true,
      updatedAt: true,
    },
  });
  const activeDeployment = selectActivePreviewDeployment(
    deployments.filter((candidate) =>
      isProjectDeploymentForProject(candidate, project.id),
    ),
  );
  const activeSnapshot = activeDeployment?.snapshot;

  if (!activeSnapshot) {
    return Response.json(
      { message: "Belum ada preview berhasil untuk diedit." },
      { status: 409 },
    );
  }

  const activeSourceRef = activeSnapshot.sourceRef;
  const artifactFiles = isProjectArtifactRefFor(
    activeSourceRef,
    "source",
    activeSnapshot.id,
  )
    ? await readProjectSourceArtifact(activeSourceRef).catch(() => [])
    : [];
  const baseFiles = artifactFiles.length
    ? artifactFiles
    : parseGeneratedProjectFiles(activeSnapshot.files);

  if (!baseFiles.length) {
    return Response.json(
      { message: "Tampilan website sebelumnya belum tersedia untuk diedit." },
      { status: 409 },
    );
  }

  const latestSuccessfulCheckpoint =
    await prisma.projectBuildCheckpoint.findFirst({
      where: { projectId: project.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, snapshotId: true },
    });
  const editIntent = classifyEditIntent({
    existingFiles: baseFiles.map((file) => file.path),
    instruction,
  });
  const editPlan = createEditPlan({
    existingFiles: baseFiles.map((file) => file.path),
    instruction,
    intent: editIntent,
    latestSuccessfulCheckpoint,
    verifiedFactFingerprint: hashCanonicalBriefContent(
      parseCanonicalBrief(project.brief, project.prompt),
    ),
  });
  if (!editPlan.ok) {
    return Response.json(
      {
        code: `edit_plan_${editPlan.code}`,
        message:
          editPlan.code === "checkpoint_required"
            ? "Preview ini belum memiliki boundary build yang bisa digunakan untuk edit."
            : "Perubahan ini perlu diperjelas sebelum website diedit.",
      },
      { status: 409 },
    );
  }

  const attempt = await createProjectEditAttempt({
    annotations: annotations.length ? annotations : undefined,
    editPlan: editPlan.plan,
    instruction,
    kind,
    parentSnapshotId: activeSnapshot.id,
    projectId: project.id,
    status: "editing",
    summary: summary || undefined,
    userId: session.user.id,
  });

  let latestProjectState: {
    buildStatus: string;
    status: string;
  } | null;

  try {
    await persistVisualSummaryMessage({
      attemptId: attempt.id,
      fallback: parseCanonicalBrief(project.brief, project.prompt)
        .discussionContext,
      messages: project.chatMessages,
      projectId: project.id,
      summary: summary || instruction,
    });

    await markStaleProjectBuilds(project.id);

    latestProjectState = await prisma.project.findFirst({
      where: { id: project.id, userId: session.user.id },
      select: { buildStatus: true, status: true },
    });
  } catch {
    await updateProjectEditAttempt(attempt.id, {
      errorMessage: "Edit setup failed before the operation claim.",
      finishedAt: new Date(),
      status: "failed",
    }).catch(() => undefined);

    return Response.json(
      {
        attemptId: attempt.id,
        code: "edit_failed_retryable",
        message:
          "Edit belum bisa dimulai. Tampilan terakhir tetap aman, coba lagi sebentar.",
      },
      { status: 503, headers: { "Retry-After": "3" } },
    );
  }

  if (
    latestProjectState?.status === "building" ||
    latestProjectState?.status === "stopping" ||
    latestProjectState?.buildStatus === "running"
  ) {
    await updateProjectEditAttempt(attempt.id, {
      status: "failed",
      errorMessage: "Another build is already running.",
      finishedAt: new Date(),
    });

    return Response.json(
      {
        attemptId: attempt.id,
        code: "project_build_in_progress",
        message: "Build masih berjalan untuk proyek ini.",
      },
      { status: 409 },
    );
  }

  let operation: Awaited<ReturnType<typeof claimProjectOperation>>;

  try {
    operation = await claimProjectOperation({
      kind: "edit",
      projectId: project.id,
      userId: session.user.id,
    });
  } catch {
    await updateProjectEditAttempt(attempt.id, {
      errorMessage: "Edit claim failed.",
      finishedAt: new Date(),
      status: "failed",
    }).catch(() => undefined);

    return Response.json(
      {
        attemptId: attempt.id,
        code: "edit_failed_retryable",
        message:
          "Edit belum bisa dimulai. Tampilan terakhir tetap aman, coba lagi sebentar.",
      },
      { status: 503, headers: { "Retry-After": "3" } },
    );
  }

  if (!operation.claimed) {
    await updateProjectEditAttempt(attempt.id, {
      errorMessage: "Another build is already running.",
      finishedAt: new Date(),
      status: "failed",
    });

    return Response.json(
      {
        attemptId: attempt.id,
        code: "project_build_in_progress",
        message: "Build masih berjalan untuk proyek ini.",
      },
      { status: 409 },
    );
  }

  try {
    await updateProjectEditAttempt(attempt.id, {
      leaseToken: operation.token,
      startedAt: new Date(),
    });
  } catch {
    await finalizeProjectOperation({
      data: { buildStatus: "passed", status: "ready" },
      projectId: project.id,
      token: operation.token,
      userId: session.user.id,
    }).catch(() => false);

    return Response.json(
      {
        attemptId: attempt.id,
        code: "edit_failed_retryable",
        message:
          "Edit belum bisa dimulai. Tampilan terakhir tetap aman, coba lagi sebentar.",
      },
      { status: 503, headers: { "Retry-After": "3" } },
    );
  }
  try {
    await enqueueAttemptJob({
      kind: "edit",
      attemptId: attempt.id,
      operationToken: operation.token,
      projectId: project.id,
      userId: session.user.id,
    });
  } catch {
    await finalizeProjectOperation({
      data: { buildStatus: "passed", status: "ready" },
      projectId: project.id,
      token: operation.token,
      userId: session.user.id,
    }).catch(() => false);
    await updateProjectEditAttempt(attempt.id, {
      errorMessage:
        "Edit belum bisa dimulai. Tampilan terakhir tetap aman, coba lagi sebentar.",
      finishedAt: new Date(),
      status: "failed",
    }).catch(() => undefined);
    return Response.json(
      {
        attemptId: attempt.id,
        code: "edit_failed_retryable",
        message:
          "Edit belum bisa dimulai. Tampilan terakhir tetap aman, coba lagi sebentar.",
      },
      { status: 503, headers: { "Retry-After": "3" } },
    );
  }

  // Stream is a view of the worker (same channel as generate reattach).
  return createReadStreamFromChannel(attempt.id);
}

async function persistVisualSummaryMessage({
  attemptId,
  fallback,
  messages,
  projectId,
  summary,
}: {
  attemptId: string;
  fallback?: {
    messages?: unknown;
    summary?: unknown;
    memoryFacts?: unknown;
  };
  messages: unknown;
  projectId: string;
  summary: string;
}) {
  await prisma.$transaction(async (transaction) => {
    const [row] = await transaction.$queryRaw<Array<{ chatMessages: unknown }>>`
      SELECT "chatMessages" FROM "Project" WHERE id = ${projectId} FOR UPDATE
    `;
    const current = resolveProjectChatState({
      chatMessages: row?.chatMessages ?? messages,
      chatSummary: null,
      memoryFacts: null,
      fallback,
    }).messages;
    if (current.some((message) => message.id === attemptId)) {
      return;
    }

    await transaction.$executeRaw`
      UPDATE "Project" SET "chatMessages" = ${JSON.stringify([
        ...current,
        {
          id: attemptId,
          parts: [{ text: summary, type: "text" }],
          role: "user",
        },
      ])}::jsonb WHERE id = ${projectId}
    `;
  });
}

type EditAttemptCreateInput = {
  annotations?: unknown;
  editPlan?: EditPlan;
  instruction: string;
  kind: string;
  parentSnapshotId: string;
  projectId: string;
  status: string;
  summary?: string;
  userId: string;
};

type EditAttemptUpdateInput = Partial<{
  advisoryIssues: unknown;
  buildId: string;
  errorMessage: string | null;
  finishedAt: Date;
  leaseToken: string;
  snapshotId: string;
  startedAt: Date;
  status: string;
  validationIssues: unknown;
}>;

async function createProjectEditAttempt(input: EditAttemptCreateInput) {
  const id = `edit_${randomUUID().replace(/-/g, "")}`;

  await prisma.projectEditAttempt.create({
    data: {
      annotations: input.annotations
        ? (input.annotations as Prisma.InputJsonValue)
        : undefined,
      editPlan: input.editPlan
        ? (input.editPlan as Prisma.InputJsonValue)
        : undefined,
      id,
      instruction: input.instruction,
      kind: input.kind,
      parentSnapshotId: input.parentSnapshotId,
      projectId: input.projectId,
      status: input.status,
      summary: input.summary,
      userId: input.userId,
    },
  });

  return { id };
}

async function updateProjectEditAttempt(
  id: string,
  input: EditAttemptUpdateInput,
) {
  await prisma.projectEditAttempt.update({
    where: { id },
    data: {
      advisoryIssues: input.advisoryIssues
        ? (input.advisoryIssues as Prisma.InputJsonValue)
        : undefined,
      buildId: input.buildId,
      errorMessage: input.errorMessage ?? undefined,
      finishedAt: input.finishedAt,
      leaseToken: input.leaseToken,
      snapshotId: input.snapshotId,
      startedAt: input.startedAt,
      status: input.status,
      validationIssues: input.validationIssues
        ? (input.validationIssues as Prisma.InputJsonValue)
        : undefined,
    },
  });
}

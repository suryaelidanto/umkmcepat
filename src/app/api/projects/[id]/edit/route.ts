import { randomUUID } from "node:crypto";

import { auth } from "@/lib/auth";
import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";
import {
  runGeneratedAppAgentTools,
  type GeneratedAppAgentToolCommand,
} from "@/lib/projects/agent-tool-runner";
import { createLocalBuildWorker } from "@/lib/projects/build-worker";
import { parseProjectChatMessages } from "@/lib/projects/chat-memory";
import { selectActivePreviewDeployment } from "@/lib/projects/deployment-resolution";
import { validateGeneratedEdit } from "@/lib/projects/edit-validation";
import {
  createGeneratedSourceSnapshotMetadata,
  parseGeneratedProjectFiles,
} from "@/lib/projects/generated-source";
import {
  readProjectSourceArtifact,
  writeProjectSourceArtifact,
} from "@/lib/projects/runtime-artifacts";
import { createRuntimeEventData } from "@/lib/projects/runtime-events";
import {
  type ProjectBuildStatus,
  type ProjectDeploymentStatus,
} from "@/lib/projects/runtime-types";
import { parseProjectSiteSchema } from "@/lib/projects/site-schema";
import { editGeneratedSourceWithAgent } from "@/lib/projects/source-edit-agent";
import { markStaleProjectBuilds } from "@/lib/projects/stale-builds";
import { sanitizeVisualAnnotations } from "@/lib/projects/visual-annotations";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 180;

type RouteProps = {
  params: Promise<{ id: string }>;
};

type EditRequest = {
  annotations?: unknown;
  commands?: GeneratedAppAgentToolCommand[];
  instruction?: string;
  kind?: string;
  summary?: string;
};

export async function POST(request: Request, { params }: RouteProps) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  const rateLimitResponse = await checkRateLimit(
    request,
    "build",
    session.user.id,
  );

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { id } = await params;
  devLog("edit", "request", { projectId: id, userId: session.user.id });
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    select: {
      buildStatus: true,
      chatMessages: true,
      id: true,
      prompt: true,
      siteSchema: true,
      status: true,
    },
  });

  devLog("edit", "project.loaded", {
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

  const body = (await request.json().catch(() => ({}))) as EditRequest;
  const requestedCommands = Array.isArray(body.commands) ? body.commands : [];
  const instruction =
    typeof body.instruction === "string" ? body.instruction.trim() : "";
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  const annotations = sanitizeVisualAnnotations(body.annotations);
  const kind =
    body.kind === "visual_comment" ? "visual_comment" : "instruction";

  if (!requestedCommands.length && !instruction) {
    return Response.json(
      { message: "Instruksi edit belum valid." },
      { status: 400 },
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
          snapshotId: true,
          status: true,
          updatedAt: true,
        },
      },
      buildId: true,
      createdAt: true,
      id: true,
      kind: true,
      snapshot: {
        select: {
          files: true,
          id: true,
          sourceRef: true,
        },
      },
      snapshotId: true,
      status: true,
      updatedAt: true,
    },
  });
  const activeDeployment = selectActivePreviewDeployment(deployments);
  const activeSnapshot = activeDeployment?.snapshot;

  if (!activeSnapshot) {
    return Response.json(
      { message: "Belum ada preview berhasil untuk diedit." },
      { status: 409 },
    );
  }

  const artifactFiles = activeSnapshot.sourceRef
    ? await readProjectSourceArtifact(activeSnapshot.sourceRef).catch(() => [])
    : [];
  const baseFiles = artifactFiles.length
    ? artifactFiles
    : parseGeneratedProjectFiles(activeSnapshot.files);

  if (!baseFiles.length) {
    return Response.json(
      { message: "Source preview belum tersedia untuk diedit." },
      { status: 409 },
    );
  }

  const attempt = await createProjectEditAttempt({
    annotations: annotations.length ? annotations : undefined,
    instruction,
    kind,
    parentSnapshotId: activeSnapshot.id,
    projectId: project.id,
    status: "editing",
    summary: summary || undefined,
    userId: session.user.id,
  });

  if (summary) {
    await persistVisualSummaryMessage({
      attemptId: attempt.id,
      messages: project.chatMessages,
      projectId: project.id,
      summary,
    });
  }

  const editResult = requestedCommands.length
    ? runGeneratedAppAgentTools({
        commands: requestedCommands,
        files: baseFiles,
      })
    : await editGeneratedSourceWithAgent({ files: baseFiles, instruction });
  devLog("edit", "tools.finished", {
    ok: editResult.ok,
    operations: editResult.operations.length,
    projectId: project.id,
    sideEffects: editResult.sideEffects.length,
  });

  if (!editResult.ok) {
    await updateProjectEditAttempt(attempt.id, {
      errorMessage: "Edit agent failed.",
      status: "failed",
      validationIssues: editResult.outputs,
    });

    return Response.json(
      {
        attemptId: attempt.id,
        message: "Edit belum bisa diterapkan. Cek instruksi dan coba lagi.",
        outputs: editResult.outputs,
      },
      { status: 400 },
    );
  }

  const touchedFiles = editResult.sideEffects
    .map((effect) => effect.path)
    .filter((path): path is string => Boolean(path));
  let editValidation = validateGeneratedEdit({
    baseFiles,
    instruction,
    nextFiles: editResult.files,
    touchedFiles,
  });

  if (!editValidation.ok && !requestedCommands.length) {
    await updateProjectEditAttempt(attempt.id, {
      status: "repairing",
      validationIssues: editValidation.blockingIssues,
    });

    const repairResult = await editGeneratedSourceWithAgent({
      files: editResult.files,
      instruction: [
        instruction,
        "Previous edit did not make a meaningful rendered-source change.",
        "Repair it now. Make concrete edits to rendered JSX/content/CSS. Run check_app.",
        `Validation issues: ${editValidation.blockingIssues.join("; ")}`,
      ].join("\n\n"),
    });

    if (repairResult.ok) {
      editResult.files = repairResult.files;
      editResult.operations = [
        ...editResult.operations,
        ...repairResult.operations,
      ];
      editResult.outputs = [...editResult.outputs, ...repairResult.outputs];
      editResult.sideEffects = [
        ...editResult.sideEffects,
        ...repairResult.sideEffects,
      ];
      touchedFiles.push(
        ...repairResult.sideEffects
          .map((effect) => effect.path)
          .filter((path): path is string => Boolean(path)),
      );
      editValidation = validateGeneratedEdit({
        baseFiles,
        instruction,
        nextFiles: editResult.files,
        touchedFiles,
      });
    }
  }

  if (!editValidation.ok) {
    devLog("edit", "validation.failed", {
      issues: editValidation.blockingIssues,
      projectId: project.id,
    });
    await updateProjectEditAttempt(attempt.id, {
      errorMessage: "Edit did not change rendered source.",
      status: "failed",
      validationIssues: editValidation.blockingIssues,
    });

    return Response.json(
      {
        attemptId: attempt.id,
        code: "edit_validation_failed",
        issues: editValidation.blockingIssues,
        message:
          "AI belum berhasil mengubah bagian website yang terlihat. Komentarmu tetap tersimpan, coba kirim ulang.",
      },
      { status: 422 },
    );
  }

  await markStaleProjectBuilds(project.id);

  const latestProjectState = await prisma.project.findFirst({
    where: { id: project.id, userId: session.user.id },
    select: { buildStatus: true, status: true },
  });

  if (
    latestProjectState?.status === "building" ||
    latestProjectState?.buildStatus === "running"
  ) {
    return Response.json(
      {
        attemptId: attempt.id,
        code: "project_build_in_progress",
        message: "Build masih berjalan untuk proyek ini.",
      },
      { status: 409 },
    );
  }

  await updateProjectEditAttempt(attempt.id, {
    advisoryIssues: editValidation.advisoryIssues,
    status: "building",
  });

  const claimedProject = await prisma.project.updateMany({
    where: {
      buildStatus: { not: "running" },
      id: project.id,
      status: { not: "building" },
      userId: session.user.id,
    },
    data: { buildStatus: "running", status: "building" },
  });

  if (claimedProject.count !== 1) {
    return Response.json(
      {
        attemptId: attempt.id,
        code: "project_build_in_progress",
        message: "Build masih berjalan untuk proyek ini.",
      },
      { status: 409 },
    );
  }

  const siteSchema = parseProjectSiteSchema(project.siteSchema, project.prompt);
  const snapshot = await prisma.projectSnapshot.create({
    data: {
      files: editResult.files,
      metadata: {
        ...createGeneratedSourceSnapshotMetadata(editResult.files, siteSchema),
        origin: {
          generator: "agent-tool-runner",
          parentSnapshotId: activeSnapshot.id,
          sourceType: "edited",
        },
        generation: {
          mode: "agent-edit",
          operationTrace: editResult.operations,
          editValidation,
          touchedFiles,
        },
        sideEffects: editResult.sideEffects,
      },
      parentSnapshotId: activeSnapshot.id,
      projectId: project.id,
      sourceType: "edited",
    },
    select: { id: true },
  });
  const sourceRef = await writeProjectSourceArtifact({
    artifactId: snapshot.id,
    files: editResult.files,
  });
  await prisma.projectSnapshot.update({
    where: { id: snapshot.id },
    data: { sourceRef },
  });
  await prisma.runtimeEvent.create({
    data: createRuntimeEventData({
      metadata: { parentSnapshotId: activeSnapshot.id, sourceRef },
      projectId: project.id,
      type: "snapshot.created",
    }),
  });

  const build = await prisma.projectBuild.create({
    data: {
      projectId: project.id,
      snapshotId: snapshot.id,
      status: "queued" satisfies ProjectBuildStatus,
    },
    select: { id: true },
  });
  await updateProjectEditAttempt(attempt.id, {
    buildId: build.id,
    snapshotId: snapshot.id,
  });
  await prisma.projectBuild.update({
    where: { id: build.id },
    data: {
      startedAt: new Date(),
      status: "running" satisfies ProjectBuildStatus,
    },
  });
  await prisma.runtimeEvent.create({
    data: createRuntimeEventData({
      buildId: build.id,
      message: "Edited source build started.",
      projectId: project.id,
      type: "build.started",
    }),
  });

  const buildResult = await createLocalBuildWorker().runBuild({
    buildId: build.id,
    files: editResult.files,
  });
  devLog("edit", "build.finished", {
    projectId: project.id,
    status: buildResult.status,
  });
  const buildStatus: ProjectBuildStatus = buildResult.status;
  const artifactRef = buildResult.artifactRef;

  await prisma.projectBuild.update({
    where: { id: build.id },
    data: {
      artifactRef,
      finishedAt: new Date(),
      logText: buildResult.logText,
      status: buildStatus,
    },
  });
  await prisma.runtimeEvent.create({
    data: createRuntimeEventData({
      buildId: build.id,
      message:
        buildResult.status === "succeeded"
          ? "Edited frontend build succeeded."
          : "Edited frontend build failed.",
      metadata: artifactRef ? { artifactRef } : undefined,
      projectId: project.id,
      type:
        buildResult.status === "succeeded" ? "build.succeeded" : "build.failed",
    }),
  });

  const deploymentStatus: ProjectDeploymentStatus =
    buildResult.status === "succeeded" ? "created" : "failed";
  const deployment = await prisma.projectDeployment.create({
    data: {
      buildId: build.id,
      kind: "preview",
      projectId: project.id,
      publicPath: `/api/projects/${project.id}/preview`,
      snapshotId: snapshot.id,
      status: deploymentStatus,
    },
    select: { id: true },
  });
  await prisma.runtimeEvent.create({
    data: createRuntimeEventData({
      buildId: build.id,
      deploymentId: deployment.id,
      projectId: project.id,
      type:
        buildResult.status === "succeeded"
          ? "deployment.created"
          : "deployment.failed",
    }),
  });

  if (buildResult.status === "succeeded") {
    await prisma.project.update({
      where: { id: project.id },
      data: {
        buildLog: buildResult.logText,
        buildStatus: "passed",
        builtAt: new Date(),
        distFiles: buildResult.distFiles,
        sourceFiles: editResult.files,
        status: "ready",
      } as Parameters<typeof prisma.project.update>[0]["data"],
    });
    await updateProjectEditAttempt(attempt.id, {
      advisoryIssues: editValidation.advisoryIssues,
      status: "succeeded",
    });
  } else {
    await prisma.project.update({
      where: { id: project.id },
      data: {
        buildLog: buildResult.logText,
        buildStatus: "failed",
      } as Parameters<typeof prisma.project.update>[0]["data"],
    });
    await updateProjectEditAttempt(attempt.id, {
      advisoryIssues: editValidation.advisoryIssues,
      errorMessage: buildResult.logText?.slice(-2000),
      status: "failed",
    });
  }

  return Response.json({
    attemptId: attempt.id,
    buildId: build.id,
    buildStatus,
    deploymentId: deployment.id,
    snapshotId: snapshot.id,
  });
}

async function persistVisualSummaryMessage({
  attemptId,
  messages,
  projectId,
  summary,
}: {
  attemptId: string;
  messages: unknown;
  projectId: string;
  summary: string;
}) {
  const current = parseProjectChatMessages(messages);
  const exists = current.some((message) => message.id === attemptId);

  if (exists) {
    return;
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      chatMessages: [
        ...current,
        {
          id: attemptId,
          metadata: undefined,
          parts: [{ text: summary, type: "text" }],
          role: "user",
        },
      ],
    } as Parameters<typeof prisma.project.update>[0]["data"],
  });
}

type EditAttemptCreateInput = {
  annotations?: unknown;
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
  snapshotId: string;
  status: string;
  validationIssues: unknown;
}>;

async function createProjectEditAttempt(input: EditAttemptCreateInput) {
  const id = `edit_${randomUUID().replace(/-/g, "")}`;

  await prisma.$executeRaw`
    INSERT INTO "ProjectEditAttempt" (
      "id",
      "projectId",
      "userId",
      "parentSnapshotId",
      "kind",
      "status",
      "instruction",
      "summary",
      "annotations",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${id},
      ${input.projectId},
      ${input.userId},
      ${input.parentSnapshotId},
      ${input.kind},
      ${input.status},
      ${input.instruction},
      ${input.summary ?? null},
      ${input.annotations ? JSON.stringify(input.annotations) : null}::jsonb,
      NOW(),
      NOW()
    )
  `;

  return { id };
}

async function updateProjectEditAttempt(
  id: string,
  input: EditAttemptUpdateInput,
) {
  await prisma.$executeRaw`
    UPDATE "ProjectEditAttempt"
    SET
      "status" = COALESCE(${input.status ?? null}, "status"),
      "snapshotId" = COALESCE(${input.snapshotId ?? null}, "snapshotId"),
      "buildId" = COALESCE(${input.buildId ?? null}, "buildId"),
      "validationIssues" = COALESCE(${input.validationIssues ? JSON.stringify(input.validationIssues) : null}::jsonb, "validationIssues"),
      "advisoryIssues" = COALESCE(${input.advisoryIssues ? JSON.stringify(input.advisoryIssues) : null}::jsonb, "advisoryIssues"),
      "errorMessage" = COALESCE(${input.errorMessage ?? null}, "errorMessage"),
      "updatedAt" = NOW()
    WHERE "id" = ${id}
  `;
}

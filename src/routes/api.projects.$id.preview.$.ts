import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPrismaDatabaseUnavailable } from "@/lib/prisma-errors";
import { selectActivePreviewDeployment } from "@/lib/projects/deployment-resolution";
import { parseGeneratedDistFiles } from "@/lib/projects/generated-source";
import { createPreviewIssueHtml } from "@/lib/projects/preview-error-html";
import { refreshProjectThumbnail } from "@/lib/projects/project-thumbnail";
import {
  applyPreviewSandboxHeaders,
  injectPreviewAnnotationBridge,
  proxyDeploymentRequest,
} from "@/lib/projects/runtime-proxy";

export const Route = createFileRoute("/api/projects/$id/preview/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => {
        const _splat = params._splat ?? "";
        const path = _splat ? _splat.split("/") : [];
        return handlePreviewGet(request, params.id, path);
      },
    },
  },
});

async function handlePreviewGet(request: Request, id: string, path: string[]) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  try {
    return await getPreviewResponse({
      id,
      path,
      request,
      userId: session.user.id,
    });
  } catch (error) {
    if (isPrismaDatabaseUnavailable(error)) {
      return createPreviewIssueResponse({
        detail:
          "Tampilan website lagi nyambung ulang. Tampilan terakhir tetap aman, coba beberapa detik lagi.",
        status: 503,
        title: "Tampilan sedang disambungkan ulang",
      });
    }

    throw error;
  }
}

async function getPreviewResponse({
  id,
  path,
  request,
  userId,
}: {
  id: string;
  path: string[];
  request: Request;
  userId: string;
}) {
  const project = await prisma.project.findFirst({
    where: { id, userId },
    select: { id: true, thumbnailBuildId: true, thumbnailRef: true },
  });

  if (!project) {
    return Response.json(
      { message: "Proyek tidak ditemukan." },
      { status: 404 },
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
      snapshotId: true,
      status: true,
      updatedAt: true,
    },
  });
  const deployment = selectActivePreviewDeployment(deployments);

  if (deployment?.build?.artifactRef) {
    scheduleThumbnailRecovery({
      artifactRef: deployment.build.artifactRef,
      buildId: deployment.build.id,
      project,
    });
    const response = await proxyDeploymentRequest({
      assetRewrite: { projectId: project.id },
      deploymentId: deployment.id,
      deploymentStatus: deployment.status,
      pathSegments: path,
      request,
    });

    if (response) {
      await prisma.projectDeployment.update({
        where: { id: deployment.id },
        data: { lastRequestAt: new Date() },
      });
      return response;
    }

    return createPreviewIssueResponse({
      detail:
        "Tampilan website belum berhasil dimulai. Coba muat ulang tampilan.",
      status: 503,
      title: "Tampilan website belum bisa dimuat",
    });
  }

  const [row] = await prisma.$queryRaw<[{ distFiles: unknown }]>`
    SELECT "distFiles" FROM "Project" WHERE id = ${project.id} AND "userId" = ${userId}
  `;
  const distFiles = parseGeneratedDistFiles(row?.distFiles);
  const requestedPath = path.join("/") || "index.html";
  const file =
    distFiles.find((item) => item.path === requestedPath) ||
    distFiles.find((item) => item.path === "index.html");

  if (!file) {
    return createPreviewIssueResponse({
      detail:
        "Jalankan build setelah brief siap, lalu tampilan akan muncul di sini.",
      status: 404,
      title: "Tampilan website belum tersedia",
    });
  }

  return new Response(
    file.contentType.toLowerCase().includes("text/html")
      ? injectPreviewAnnotationBridge(file.content)
      : file.content,
    {
      headers: applyPreviewSandboxHeaders(
        new Headers({ "Content-Type": file.contentType }),
      ),
    },
  );
}

function scheduleThumbnailRecovery({
  artifactRef,
  buildId,
  project,
}: {
  artifactRef: string;
  buildId: string;
  project: {
    id: string;
    thumbnailBuildId: string | null;
    thumbnailRef: string | null;
  };
}) {
  if (project.thumbnailRef && project.thumbnailBuildId === buildId) {
    return;
  }

  // Fire-and-forget post-response work: refresh the thumbnail without blocking
  // the preview response. The Bun/Node server keeps the event loop alive until
  // this settles; errors are swallowed so a thumbnail failure never affects the
  // served preview (mirrors the previous next/server `after()` behavior).
  void refreshProjectThumbnail({
    artifactRef,
    buildId,
    projectId: project.id,
  }).catch(() => undefined);
}

function createPreviewIssueResponse({
  detail,
  status,
  title,
}: {
  detail: string;
  status: number;
  title: string;
}) {
  return new Response(createPreviewIssueHtml({ detail, title }), {
    headers: applyPreviewSandboxHeaders(
      new Headers({ "Content-Type": "text/html; charset=utf-8" }),
    ),
    status,
  });
}

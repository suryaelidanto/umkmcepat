import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import { isPrismaDatabaseUnavailable } from "@/lib/prisma-errors";
import {
  isProjectDeploymentForProject,
  selectActivePreviewDeployment,
} from "@/lib/projects/deployment-resolution";
import { parseGeneratedDistFiles } from "@/lib/projects/generated-source";
import { createPreviewIssueHtml } from "@/lib/projects/preview-error-html";
import { refreshProjectThumbnail } from "@/lib/projects/project-thumbnail";
import { readProjectDistArtifact } from "@/lib/projects/runtime-artifacts";
import {
  applyPreviewSandboxHeaders,
  injectPreviewAnnotationBridge,
  injectPreviewHead,
  proxyDeploymentRequest,
  rewritePreviewAssetUrls,
} from "@/lib/projects/runtime-proxy";
import { parseProjectSiteSchema } from "@/lib/projects/site-schema";
import { isAdminEmail } from "@/lib/waitlist/waitlist";

const PREVIEW_ASSET_ROOTS = new Set(["assets", "images"]);

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
      admin: isAdminEmail(session.user.email ?? ""),
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
  admin,
  userId,
}: {
  admin: boolean;
  id: string;
  path: string[];
  request: Request;
  userId: string;
}) {
  const project = await prisma.project.findFirst({
    where: { id, ...(admin ? {} : { userId }) },
    select: {
      id: true,
      siteSchema: true,
      thumbnailBuildId: true,
      thumbnailRef: true,
      title: true,
      userId: true,
    },
  });

  if (!project) {
    return Response.json(
      { message: "Proyek tidak ditemukan." },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const targetSnapshotId = url.searchParams.get("snapshotId");
  const hasTargetSnapshot = targetSnapshotId !== null;

  const deployments = await prisma.projectDeployment.findMany({
    where: {
      kind: "preview",
      projectId: project.id,
      ...(hasTargetSnapshot ? { snapshotId: targetSnapshotId } : {}),
    },
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
      snapshot: { select: { id: true, projectId: true } },
      snapshotId: true,
      status: true,
      updatedAt: true,
    },
  });
  const deployment = selectActivePreviewDeployment(
    deployments.filter((candidate) =>
      isProjectDeploymentForProject(candidate, project.id),
    ),
  );

  if (deployment?.build?.artifactRef) {
    const observerReadOnly = admin && project.userId !== userId;
    if (!observerReadOnly) {
      scheduleThumbnailRecovery({
        artifactRef: deployment.build.artifactRef,
        buildId: deployment.build.id,
        project,
      });
    }
    const response = await proxyDeploymentRequest({
      assetRewrite: { projectId: project.id },
      businessName: parseProjectSiteSchema(project.siteSchema, project.title)
        .businessName,
      deploymentId: deployment.id,
      deploymentStatus: deployment.status,
      pathSegments: path,
      request,
    });

    if (response) {
      if (!observerReadOnly) {
        await prisma.projectDeployment.update({
          where: { id: deployment.id },
          data: { lastRequestAt: new Date() },
        });
      }
      return response;
    }

    const staticResponse = await getStoredPreviewResponse({
      artifactRef: deployment.build.artifactRef,
      businessName: parseProjectSiteSchema(project.siteSchema, project.title)
        .businessName,
      projectId: project.id,
      path,
    });
    if (staticResponse) {
      return staticResponse;
    }

    return createPreviewIssueResponse({
      detail:
        "Tampilan website belum berhasil dimulai. Coba muat ulang tampilan.",
      status: 503,
      title: "Tampilan website belum bisa dimuat",
    });
  }

  if (hasTargetSnapshot) {
    return createPreviewIssueResponse({
      detail: "Versi ini belum berhasil dibuat untuk Preview.",
      status: 404,
      title: "Versi Preview tidak tersedia",
    });
  }

  const staticResponse = await getStoredPreviewResponse({
    businessName: parseProjectSiteSchema(project.siteSchema, project.title)
      .businessName,
    projectId: project.id,
    path,
  });
  if (staticResponse) {
    return staticResponse;
  }

  return createPreviewIssueResponse({
    detail:
      "Jalankan build setelah brief siap, lalu tampilan akan muncul di sini.",
    status: 404,
    title: "Tampilan website belum tersedia",
  });
}

async function getStoredPreviewResponse({
  artifactRef,
  businessName,
  projectId,
  path,
}: {
  artifactRef?: string | null;
  businessName?: string | null;
  path: string[];
  projectId: string;
}) {
  const distFiles = artifactRef
    ? await readProjectDistArtifact(artifactRef).catch(() => null)
    : await readStoredProjectDistFiles(projectId);
  if (!distFiles) {
    return null;
  }

  const requestedPath = path.join("/") || "index.html";
  const file =
    distFiles.find((item) => item.path === requestedPath) ||
    (isPreviewAssetPath(path)
      ? undefined
      : distFiles.find((item) => item.path === "index.html"));

  if (!file) {
    return isPreviewAssetPath(path)
      ? createPreviewIssueResponse({
          detail: "Aset yang kamu cari tidak tersedia.",
          status: 404,
          title: "Aset tidak ditemukan",
        })
      : null;
  }

  const isHtml = file.contentType.toLowerCase().includes("text/html");
  const isImage =
    file.contentType.toLowerCase().startsWith("image/") &&
    !file.contentType.includes("svg");
  const body = isImage
    ? Buffer.from(file.content, "base64")
    : isHtml
      ? injectPreviewHead(
          injectPreviewAnnotationBridge(
            rewritePreviewAssetUrls(file.content, {
              deploymentId: "stored",
              projectId,
            }),
          ),
          { businessName },
        )
      : file.content;

  return new Response(body, {
    headers: applyPreviewSandboxHeaders(
      new Headers({ "Content-Type": file.contentType }),
    ),
  });
}

function isPreviewAssetPath(pathSegments: string[]): boolean {
  return PREVIEW_ASSET_ROOTS.has(pathSegments[0] ?? "");
}

async function readStoredProjectDistFiles(projectId: string) {
  const [row] = await prisma.$queryRaw<[{ distFiles: unknown }]>`
    SELECT "distFiles" FROM "Project" WHERE id = ${projectId}
  `;
  return parseGeneratedDistFiles(row?.distFiles);
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

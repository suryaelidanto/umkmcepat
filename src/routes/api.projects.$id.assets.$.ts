import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import { isPrismaDatabaseUnavailable } from "@/lib/prisma-errors";
import {
  isProjectDeploymentForProject,
  selectActivePreviewDeployment,
} from "@/lib/projects/deployment-resolution";
import { parseGeneratedDistFiles } from "@/lib/projects/generated-source";
import {
  PREVIEW_ASSET_TOKEN_PARAM,
  verifyPreviewAssetToken,
} from "@/lib/projects/preview-asset-token";
import {
  isProjectArtifactRefFor,
  readProjectDistArtifact,
} from "@/lib/projects/runtime-artifacts";
import {
  applyPreviewSandboxHeaders,
  proxyDeploymentRequest,
} from "@/lib/projects/runtime-proxy";

export const Route = createFileRoute("/api/projects/$id/assets/$")({
  server: {
    handlers: {
      OPTIONS: () => {
        const res = new Response(null, { status: 204 });
        applyPreviewSandboxHeaders(res.headers);
        return res;
      },
      GET: async ({ request, params }) => {
        const { id } = params;
        const _splat = params._splat ?? "";
        const path = _splat ? _splat.split("/").filter(Boolean) : [];

        try {
          return await getAssetResponse({ id, path, request });
        } catch (error) {
          if (isPrismaDatabaseUnavailable(error)) {
            return sandboxJson(
              {
                code: "database_unavailable",
                message: "Aset website lagi nyambung ulang.",
              },
              { status: 503, headers: { "Retry-After": "3" } },
            );
          }

          throw error;
        }
      },
    },
  },
});

async function getAssetResponse({
  id,
  path,
  request,
}: {
  id: string;
  path: string[];
  request: Request;
}) {
  const assetPath = path[0] === "images" ? path : ["assets", ...path];
  const deployments = await prisma.projectDeployment.findMany({
    where: { kind: "preview", projectId: id },
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
      isProjectDeploymentForProject(candidate, id),
    ),
  );
  const requestUrl = new URL(request.url);
  const assetToken = requestUrl.searchParams.get(PREVIEW_ASSET_TOKEN_PARAM);

  const hasValidToken =
    deployment?.build?.artifactRef &&
    (verifyPreviewAssetToken({
      deploymentId: deployment.id,
      projectId: id,
      token: assetToken,
    }) ||
      verifyPreviewAssetToken({
        deploymentId: "stored",
        projectId: id,
        token: assetToken,
      }));

  if (hasValidToken) {
    const response = await proxyDeploymentRequest({
      deploymentId: deployment.id,
      deploymentStatus: deployment.status,
      pathSegments: assetPath,
      request,
    });

    if (response) {
      await prisma.projectDeployment.update({
        where: { id: deployment.id },
        data: { lastRequestAt: new Date() },
      });
      return response;
    }

    const staticResponse = await getStoredAssetResponse({
      artifactId: deployment.build?.id,
      artifactRef: deployment.build?.artifactRef,
      path: assetPath,
      projectId: id,
    });
    if (staticResponse) {
      return staticResponse;
    }

    return sandboxJson(
      { message: "Tampilan website belum bisa dimulai." },
      { status: 503 },
    );
  }

  const session = await auth();

  if (!session?.user?.id) {
    return sandboxJson(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });

  if (!project) {
    return sandboxJson({ message: "Proyek tidak ditemukan." }, { status: 404 });
  }

  if (deployment?.build?.artifactRef) {
    const response = await proxyDeploymentRequest({
      deploymentId: deployment.id,
      deploymentStatus: deployment.status,
      pathSegments: assetPath,
      request,
    });

    if (response) {
      await prisma.projectDeployment.update({
        where: { id: deployment.id },
        data: { lastRequestAt: new Date() },
      });
      return response;
    }

    const staticResponse = await getStoredAssetResponse({
      artifactId: deployment.build.id,
      artifactRef: deployment.build.artifactRef,
      path: assetPath,
      projectId: id,
    });
    if (staticResponse) {
      return staticResponse;
    }

    return sandboxJson(
      { message: "Tampilan website belum bisa dimulai." },
      { status: 503 },
    );
  }

  const staticResponse = await getStoredAssetResponse({
    path: assetPath,
    projectId: project.id,
  });
  if (staticResponse) {
    return staticResponse;
  }

  return sandboxJson(
    { message: "Aset website belum tersedia." },
    { status: 404 },
  );
}

async function getStoredAssetResponse({
  artifactId,
  artifactRef,
  path,
  projectId,
}: {
  artifactId?: string;
  artifactRef?: string | null;
  path: string[];
  projectId: string;
}) {
  const requestedPath = path.join("/");
  const candidateArtifact = isProjectArtifactRefFor(
    artifactRef,
    "dist",
    artifactId ?? "",
  )
    ? artifactRef
    : null;

  if (candidateArtifact) {
    const distFiles = await readProjectDistArtifact(candidateArtifact).catch(
      () => [],
    );
    const file = distFiles.find(
      (item) =>
        item.path === requestedPath || item.path === `assets/${requestedPath}`,
    );
    if (file) {
      const isImage =
        file.contentType.toLowerCase().startsWith("image/") &&
        !file.contentType.includes("svg");
      const body = isImage ? Buffer.from(file.content, "base64") : file.content;
      return new Response(body, {
        headers: applyPreviewSandboxHeaders(
          new Headers({ "Content-Type": file.contentType }),
        ),
      });
    }
  }

  if (artifactId !== undefined || artifactRef !== undefined) {
    return null;
  }

  const storedFiles = await readStoredProjectDistFiles(projectId);
  const file = storedFiles.find(
    (item) =>
      item.path === requestedPath || item.path === `assets/${requestedPath}`,
  );

  if (!file) {
    return null;
  }

  const isImage =
    file.contentType.toLowerCase().startsWith("image/") &&
    !file.contentType.includes("svg");
  const body = isImage ? Buffer.from(file.content, "base64") : file.content;

  return new Response(body, {
    headers: applyPreviewSandboxHeaders(
      new Headers({ "Content-Type": file.contentType }),
    ),
  });
}

async function readStoredProjectDistFiles(projectId: string) {
  const [row] = await prisma.$queryRaw<[{ distFiles: unknown }]>`
    SELECT "distFiles" FROM "Project" WHERE id = ${projectId}
  `;
  return parseGeneratedDistFiles(row?.distFiles);
}

function sandboxJson(
  body: { code?: string; message: string },
  init: ResponseInit,
) {
  return Response.json(body, {
    ...init,
    headers: applyPreviewSandboxHeaders(new Headers(init.headers)),
  });
}

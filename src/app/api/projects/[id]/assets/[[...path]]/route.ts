import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseGeneratedDistFiles } from "@/lib/projects/generated-source";
import {
  PREVIEW_ASSET_TOKEN_PARAM,
  verifyPreviewAssetToken,
} from "@/lib/projects/preview-asset-token";
import {
  applyPreviewSandboxHeaders,
  proxyDeploymentRequest,
} from "@/lib/projects/runtime-proxy";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; path?: string[] }> },
) {
  const { id, path = [] } = await params;
  const assetPath = ["assets", ...path];
  const deployment = await prisma.projectDeployment.findFirst({
    where: { kind: "preview", projectId: id },
    orderBy: { createdAt: "desc" },
    select: {
      build: { select: { artifactRef: true } },
      id: true,
      projectId: true,
      status: true,
    },
  });
  const requestUrl = new URL(request.url);
  const assetToken = requestUrl.searchParams.get(PREVIEW_ASSET_TOKEN_PARAM);

  if (
    deployment?.build?.artifactRef &&
    verifyPreviewAssetToken({
      deploymentId: deployment.id,
      projectId: deployment.projectId,
      token: assetToken,
    })
  ) {
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

    return sandboxJson(
      { message: "Tampilan website belum bisa dimulai." },
      { status: 503 },
    );
  }

  const [row] = await prisma.$queryRaw<[{ distFiles: unknown }]>`
    SELECT "distFiles" FROM "Project" WHERE id = ${project.id} AND "userId" = ${session.user.id}
  `;
  const distFiles = parseGeneratedDistFiles(row?.distFiles);
  const requestedPath = assetPath.join("/");
  const file = distFiles.find((item) => item.path === requestedPath);

  if (!file) {
    return sandboxJson(
      { message: "Aset website belum tersedia." },
      { status: 404 },
    );
  }

  return new Response(file.content, {
    headers: applyPreviewSandboxHeaders(
      new Headers({ "Content-Type": file.contentType }),
    ),
  });
}

function sandboxJson(body: { message: string }, init: ResponseInit) {
  return Response.json(body, {
    ...init,
    headers: applyPreviewSandboxHeaders(new Headers(init.headers)),
  });
}

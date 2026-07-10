import { resolveGeneratedPublicRequest } from "@/lib/generated-public-origin";
import { prisma } from "@/lib/prisma";
import { selectActivePublishedDeployment } from "@/lib/projects/deployment-resolution";
import { proxyDeploymentRequest } from "@/lib/projects/runtime-proxy";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path?: string[]; slug: string }> },
) {
  const { path = [], slug } = await params;
  const resolution = resolveGeneratedPublicRequest(request, slug, path);

  if (resolution.action === "disabled") {
    return Response.json(
      {
        code: "generated_public_execution_unavailable",
        message: "Website publik sedang tidak tersedia sementara.",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": "30",
          "X-Robots-Tag": "noindex",
        },
      },
    );
  }

  if (resolution.action === "redirect") {
    return new Response(null, {
      status: 307,
      headers: {
        "Cache-Control": "no-store",
        Location: resolution.location,
      },
    });
  }

  const deployments = await prisma.projectDeployment.findMany({
    where: { kind: "published", slug },
    orderBy: { updatedAt: "desc" },
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
  const deployment = selectActivePublishedDeployment(deployments);

  if (!deployment?.build?.artifactRef) {
    return Response.json(
      { message: "Website belum tersedia." },
      { status: 404 },
    );
  }

  const response = await proxyDeploymentRequest({
    deploymentId: deployment.id,
    deploymentStatus: deployment.status,
    noindex: false,
    pathSegments: path,
    request,
  });

  if (!response) {
    return Response.json(
      { message: "Website belum bisa dimulai." },
      { status: 503 },
    );
  }

  await prisma.projectDeployment.update({
    where: { id: deployment.id },
    data: { lastRequestAt: new Date() },
  });

  return response;
}

import { createFileRoute } from "@tanstack/react-router";

import { resolveGeneratedPublicRequest } from "@/lib/generated-public-origin";
import { prisma } from "@/lib/prisma";
import { selectActivePublishedDeployment } from "@/lib/projects/deployment-resolution";
import { createPreviewIssueHtml } from "@/lib/projects/preview-error-html";
import { proxyDeploymentRequest } from "@/lib/projects/runtime-proxy";

function createPublicIssueResponse({
  detail,
  headers,
  status,
  title,
}: {
  detail: string;
  headers?: HeadersInit;
  status: number;
  title: string;
}) {
  return new Response(createPreviewIssueHtml({ detail, title }), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...headers,
    },
    status,
  });
}

export const Route = createFileRoute("/p/$slug/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const slug = params.slug;
        const _splat = params._splat ?? "";
        const path = _splat ? _splat.split("/") : [];
        const resolution = resolveGeneratedPublicRequest(request, slug, path);

        if (resolution.action === "disabled") {
          return createPublicIssueResponse({
            detail: "Website publik sedang tidak tersedia sementara.",
            headers: {
              "Cache-Control": "no-store",
              "Retry-After": "30",
              "X-Robots-Tag": "noindex",
            },
            status: 503,
            title: "Website sedang tidak tersedia",
          });
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

        const url = new URL(request.url);
        if (_splat === "" && !url.pathname.endsWith("/")) {
          return new Response(null, {
            status: 301,
            headers: {
              Location: `${url.pathname}/${url.search}`,
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
          return createPublicIssueResponse({
            detail: "Website belum tersedia.",
            status: 404,
            title: "Website belum tersedia",
          });
        }

        const response = await proxyDeploymentRequest({
          deploymentId: deployment.id,
          deploymentStatus: deployment.status,
          noindex: false,
          pathSegments: path,
          request,
        });

        if (!response) {
          return createPublicIssueResponse({
            detail: "Website belum bisa dimulai.",
            status: 503,
            title: "Website belum bisa dimulai",
          });
        }

        await prisma.projectDeployment.update({
          where: { id: deployment.id },
          data: { lastRequestAt: new Date() },
        });

        return response;
      },
    },
  },
});

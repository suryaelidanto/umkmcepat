import { createFileRoute } from "@tanstack/react-router";

import { resolveGeneratedPublicRequest } from "@/lib/generated-public-origin";
import { prisma } from "@/lib/prisma";
import { selectActivePublishedDeployment } from "@/lib/projects/deployment-resolution";
import { createPreviewIssueHtml } from "@/lib/projects/preview-error-html";
import { readProjectDistArtifact } from "@/lib/projects/runtime-artifacts";
import {
  applyPreviewSandboxHeaders,
  injectPublishedHead,
  proxyDeploymentRequest,
  rewritePublicAssetUrls,
} from "@/lib/projects/runtime-proxy";

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
                snapshot: {
                  select: {
                    project: {
                      select: {
                        title: true,
                        user: { select: { bannedAt: true } },
                      },
                    },
                  },
                },
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

        if (deployment?.build?.snapshot?.project?.user?.bannedAt) {
          return createPublicIssueResponse({
            detail:
              "Website ini tidak lagi tersedia. Jika kamu pemiliknya, hubungi dukungan.",
            headers: {
              "Cache-Control": "no-store",
              "X-Robots-Tag": "noindex",
            },
            status: 410,
            title: "Website tidak tersedia",
          });
        }

        if (!deployment?.build?.artifactRef) {
          return createPublicIssueResponse({
            detail: "Website belum tersedia.",
            status: 404,
            title: "Website belum tersedia",
          });
        }

        const businessName = deployment.build?.snapshot?.project?.title;
        const response = await proxyDeploymentRequest({
          businessName,
          deploymentId: deployment.id,
          deploymentStatus: deployment.status,
          noindex: false,
          pathSegments: path,
          publicAssetRewrite: { slug },
          request,
        });

        if (!response) {
          const staticResponse = await getPublishedArtifactResponse({
            artifactRef: deployment.build.artifactRef,
            businessName,
            path,
            slug,
          });
          if (staticResponse) {
            return staticResponse;
          }

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

async function getPublishedArtifactResponse({
  artifactRef,
  businessName,
  path,
  slug,
}: {
  artifactRef: string;
  businessName?: string | null;
  path: string[];
  slug: string;
}) {
  const files = await readProjectDistArtifact(artifactRef).catch(() => []);
  const requestedPath = path.join("/") || "index.html";
  const file =
    files.find((candidate) => candidate.path === requestedPath) ||
    files.find((candidate) => candidate.path === "index.html");

  if (!file) {
    return null;
  }

  const isHtml = file.contentType.toLowerCase().includes("text/html");
  const isImage =
    file.contentType.toLowerCase().startsWith("image/") &&
    !file.contentType.includes("svg");
  const body = isImage
    ? Buffer.from(file.content, "base64")
    : isHtml
      ? injectPublishedHead(rewritePublicAssetUrls(file.content, slug), {
          businessName,
          noindex: false,
          slug,
        })
      : file.content;
  const headers = applyPreviewSandboxHeaders(
    new Headers({ "Content-Type": file.contentType }),
    { noindex: false },
  );

  return new Response(body, { headers });
}

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPrismaDatabaseUnavailable } from "@/lib/prisma-errors";
import { selectActivePreviewDeployment } from "@/lib/projects/deployment-resolution";
import { parseGeneratedDistFiles } from "@/lib/projects/generated-source";
import {
  applyPreviewSandboxHeaders,
  injectPreviewAnnotationBridge,
  proxyDeploymentRequest,
} from "@/lib/projects/runtime-proxy";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; path?: string[] }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  const { id, path = [] } = await params;

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
    select: { id: true },
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

function createPreviewIssueHtml({
  detail,
  title,
}: {
  detail: string;
  title: string;
}) {
  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #10100f;
        color: #fcfbf8;
      }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background: #10100f;
      }
      main {
        width: min(92vw, 34rem);
        box-sizing: border-box;
        border: 1px solid rgba(255, 180, 166, 0.2);
        border-radius: 24px;
        background: #241d1a;
        padding: 32px;
        text-align: center;
      }
      h1 {
        margin: 0;
        font-size: clamp(1.4rem, 4vw, 2rem);
        line-height: 1.1;
      }
      p {
        margin: 14px auto 0;
        max-width: 26rem;
        color: rgba(252, 251, 248, 0.68);
        font-size: 0.95rem;
        line-height: 1.7;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(detail)}</p>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

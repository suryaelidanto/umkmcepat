import { devLog } from "@/lib/dev-log";
import {
  createPreviewAssetToken,
  PREVIEW_ASSET_TOKEN_PARAM,
} from "@/lib/projects/preview-asset-token";
import {
  getRuntimeSupervisor,
  type RuntimeSupervisor,
} from "@/lib/projects/runtime-supervisor";

type ProxyDeploymentRequestInput = {
  assetRewrite?: {
    projectId: string;
  };
  deploymentId: string;
  deploymentStatus: string;
  noindex?: boolean;
  pathSegments: string[];
  request: Request;
  supervisor?: RuntimeSupervisor;
};

export async function proxyDeploymentRequest(
  input: ProxyDeploymentRequestInput,
) {
  const supervisor = input.supervisor ?? getRuntimeSupervisor();
  devLog("runtime-proxy", "request", {
    deploymentId: input.deploymentId,
    path: input.pathSegments.join("/") || "index.html",
    status: input.deploymentStatus,
  });
  const checkedStatus =
    input.deploymentStatus === "running"
      ? await supervisor.getDeploymentStatus(input.deploymentId)
      : input.deploymentStatus;
  const status =
    checkedStatus === "running"
      ? checkedStatus
      : await supervisor.startDeployment(input.deploymentId);

  if (status !== "running") {
    devLog("runtime-proxy", "not-running", {
      deploymentId: input.deploymentId,
      status,
    });
    return null;
  }

  const target = await supervisor.resolveDeploymentTarget(input.deploymentId);

  if (!target) {
    devLog("runtime-proxy", "missing-target", {
      deploymentId: input.deploymentId,
    });
    return null;
  }

  const requestUrl = new URL(input.request.url);
  const runtimeUrl = new URL(
    encodeRuntimePath(input.pathSegments),
    target.endsWith("/") ? target : `${target}/`,
  );

  runtimeUrl.search = requestUrl.search;

  const runtimeResponse = await fetch(runtimeUrl, { cache: "no-store" });
  devLog("runtime-proxy", "response", {
    deploymentId: input.deploymentId,
    path: runtimeUrl.pathname,
    status: runtimeResponse.status,
  });
  const headers = new Headers(runtimeResponse.headers);

  applyPreviewSandboxHeaders(headers, { noindex: input.noindex ?? true });

  if (
    input.assetRewrite &&
    runtimeResponse.status === 200 &&
    headers.get("content-type")?.toLowerCase().includes("text/html")
  ) {
    headers.delete("content-length");

    return new Response(
      rewritePreviewAssetUrls(await runtimeResponse.text(), {
        deploymentId: input.deploymentId,
        projectId: input.assetRewrite.projectId,
      }),
      {
        headers,
        status: runtimeResponse.status,
        statusText: runtimeResponse.statusText,
      },
    );
  }

  return new Response(runtimeResponse.body, {
    headers,
    status: runtimeResponse.status,
    statusText: runtimeResponse.statusText,
  });
}

export function applyPreviewSandboxHeaders(
  headers: Headers,
  { noindex = true }: { noindex?: boolean } = {},
) {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");

  if (noindex) {
    headers.set("X-Robots-Tag", "noindex");
  } else {
    headers.delete("X-Robots-Tag");
  }

  return headers;
}

function encodeRuntimePath(pathSegments: string[]) {
  return pathSegments.map((segment) => encodeURIComponent(segment)).join("/");
}

export function rewritePreviewAssetUrls(
  html: string,
  {
    deploymentId,
    projectId,
  }: {
    deploymentId: string;
    projectId: string;
  },
) {
  const token = createPreviewAssetToken({ deploymentId, projectId });

  return html.replace(
    /\b(src|href)="\.\/assets\/([^"]+)"/g,
    (_match, attribute: string, assetPath: string) => {
      const encodedPath = assetPath
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");

      return `${attribute}="/api/projects/${encodeURIComponent(projectId)}/assets/${encodedPath}?${PREVIEW_ASSET_TOKEN_PARAM}=${encodeURIComponent(token)}"`;
    },
  );
}

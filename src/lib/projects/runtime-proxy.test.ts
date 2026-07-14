import { createServer, type Server } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyPreviewSandboxHeaders,
  injectPreviewAnnotationBridge,
  proxyDeploymentRequest,
  rewritePreviewAssetUrls,
} from "@/lib/projects/runtime-proxy";

let server: Server | null = null;

describe("runtime proxy", () => {
  it("injects the private preview annotation bridge once", () => {
    const html = injectPreviewAnnotationBridge(
      "<html><body><main></main></body></html>",
    );

    expect(html).toContain("data-umkm-annotation-bridge");
    expect(html).toContain(
      "element.closest('.umkm-annotation-marker,.umkm-annotation-hover')",
    );
    expect(html).toContain("document.elementsFromPoint");
    expect(html).toContain("function selectionAt");
    expect(html).toContain("function isLeafTarget");
    expect(html).toContain("function selectionAt");
    expect(html).toContain("range.getBoundingClientRect()");
    expect(html).toContain("p|label|li|blockquote");
    expect(html).toContain("badge|card|capsule|chip");
    expect(html).toContain(":nth-of-type(");
    expect(injectPreviewAnnotationBridge(html)).toBe(html);
  });
  afterEach(async () => {
    vi.restoreAllMocks();

    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = null;
    }
  });

  it("cold-starts stopped deployments and proxies the runtime response", async () => {
    const target = await startTestServer();
    const supervisor = {
      getDeploymentStatus: vi.fn(async () => "stopped" as const),
      resolveDeploymentTarget: vi.fn(async () => target),
      startDeployment: vi.fn(async () => "running" as const),
      stopDeployment: vi.fn(async () => "stopped" as const),
    };
    const response = await proxyDeploymentRequest({
      deploymentId: "deployment_1",
      deploymentStatus: "stopped",
      pathSegments: ["assets", "app.js"],
      request: new Request("http://localhost/preview/assets/app.js?cache=0"),
      supervisor,
    });

    expect(supervisor.startDeployment).toHaveBeenCalledWith("deployment_1");
    expect(response?.status).toBe(200);
    expect(response?.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response?.headers.get("Cross-Origin-Resource-Policy")).toBe(
      "cross-origin",
    );
    expect(response?.headers.get("X-Robots-Tag")).toBe("noindex");
    await expect(response?.text()).resolves.toBe("/assets/app.js?cache=0");
  });

  it("restarts stale running deployments in the same request", async () => {
    const target = await startTestServer();
    const supervisor = {
      getDeploymentStatus: vi.fn(async () => "stopped" as const),
      resolveDeploymentTarget: vi.fn(async () => target),
      startDeployment: vi.fn(async () => "running" as const),
      stopDeployment: vi.fn(async () => "stopped" as const),
    };
    const response = await proxyDeploymentRequest({
      deploymentId: "deployment_1",
      deploymentStatus: "running",
      pathSegments: [],
      request: new Request("http://localhost/preview"),
      supervisor,
    });

    expect(supervisor.getDeploymentStatus).toHaveBeenCalledWith("deployment_1");
    expect(supervisor.startDeployment).toHaveBeenCalledWith("deployment_1");
    expect(response?.status).toBe(200);
    await expect(response?.text()).resolves.toBe("/");
  });

  it("maps runtime network failures to a recoverable missing response", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    const response = await proxyDeploymentRequest({
      deploymentId: "deployment_timeout",
      deploymentStatus: "running",
      pathSegments: [],
      request: new Request("http://localhost/preview"),
      supervisor: {
        getDeploymentStatus: vi.fn(async () => "running" as const),
        resolveDeploymentTarget: vi.fn(async () => "http://127.0.0.1:65535"),
        startDeployment: vi.fn(async () => "running" as const),
        stopDeployment: vi.fn(async () => "stopped" as const),
      },
    });

    expect(response).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("allows published routes to opt out of noindex", async () => {
    const target = await startTestServer();
    const response = await proxyDeploymentRequest({
      deploymentId: "deployment_1",
      deploymentStatus: "running",
      noindex: false,
      pathSegments: [],
      request: new Request("http://localhost/p/site"),
      supervisor: {
        getDeploymentStatus: vi.fn(async () => "running" as const),
        resolveDeploymentTarget: vi.fn(async () => target),
        startDeployment: vi.fn(async () => "running" as const),
        stopDeployment: vi.fn(async () => "stopped" as const),
      },
    });

    expect(response?.headers.has("X-Robots-Tag")).toBe(false);
    await expect(response?.text()).resolves.toBe("/");
  });

  it("rewrites generated HTML asset URLs for sandboxed private frames", () => {
    const html =
      '<script type="module" crossorigin src="./assets/app.js"></script><link rel="stylesheet" href="./assets/app.css">';
    const result = rewritePreviewAssetUrls(html, {
      deploymentId: "deployment_1",
      projectId: "project_1",
    });

    expect(result).toContain("/api/projects/project_1/assets/app.js?");
    expect(result).toContain("/api/projects/project_1/assets/app.css?");
    expect(result).toContain("assetToken=");
    expect(result).not.toContain("./assets/");
  });

  it("applies sandbox headers for legacy preview responses", () => {
    const headers = applyPreviewSandboxHeaders(
      new Headers({ "Content-Type": "text/javascript; charset=utf-8" }),
    );

    expect(headers.get("Content-Type")).toBe("text/javascript; charset=utf-8");
    expect(headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(headers.get("Cross-Origin-Resource-Policy")).toBe("cross-origin");
    expect(headers.get("Content-Security-Policy")).toBe(
      "sandbox allow-scripts",
    );
    expect(headers.get("X-Robots-Tag")).toBe("noindex");
  });
});

async function startTestServer() {
  server = createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(request.url);
  });

  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a port.");
  }

  return `http://127.0.0.1:${address.port}`;
}

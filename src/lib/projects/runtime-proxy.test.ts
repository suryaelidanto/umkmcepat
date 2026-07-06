import { createServer, type Server } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import { proxyDeploymentRequest } from "@/lib/projects/runtime-proxy";

let server: Server | null = null;

describe("runtime proxy", () => {
  afterEach(async () => {
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
    expect(response?.headers.get("X-Robots-Tag")).toBe("noindex");
    await expect(response?.text()).resolves.toBe("/assets/app.js?cache=0");
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

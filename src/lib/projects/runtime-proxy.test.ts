import { createServer, type Server } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyPreviewSandboxHeaders,
  buildImageFallbackScript,
  getPreviewDocumentMetadata,
  getPublishedDocumentMetadata,
  injectPreviewAnnotationBridge,
  injectPublishedHead,
  pickPreviewAnnotationCandidateIndex,
  pickPlaceholderDataUri,
  proxyDeploymentRequest,
  rewritePreviewAssetUrls,
  rewritePublicAssetUrls,
} from "@/lib/projects/runtime-proxy";

let server: Server | null = null;

describe("runtime proxy", () => {
  it("derives stable metadata for a private generated preview", () => {
    expect(getPreviewDocumentMetadata("Beras GG")).toEqual({
      description: "Website usaha Beras GG.",
      title: "Beras GG",
      viewport: "width=device-width, initial-scale=1",
    });
    expect(getPreviewDocumentMetadata(null).title).toBe("UMKM Cepat");
  });

  it("derives stable metadata for a published generated site", () => {
    expect(getPublishedDocumentMetadata("Beras GG")).toEqual({
      description: "Website usaha Beras GG. Dibuat dengan UMKM Cepat.",
      name: "Beras GG",
      title: "Beras GG — Website UMKM Cepat",
      viewport: "width=device-width, initial-scale=1",
    });
  });

  it("injects the private preview annotation bridge once", () => {
    const html = injectPreviewAnnotationBridge(
      "<html><body><main></main></body></html>",
    );

    expect(html).toContain("data-umkm-annotation-bridge");
    expect(html).toContain(
      "element.closest('.umkm-annotation-marker,.umkm-annotation-hover')",
    );
    expect(html).toContain("function selectionAt");
    expect(html).toContain("function deepElementFromPoint");
    expect(html).toContain("function pickElement");
    expect(html).toContain(
      "if (!isIgnorableDecoration(element)) return element;",
    );
    expect(html).not.toContain("const hovered = recentHoverTargetAt");
    expect(injectPreviewAnnotationBridge(html)).toBe(html);
  });

  it("injects the direct edit-mode bridge", () => {
    const html = injectPreviewAnnotationBridge("<html><body></body></html>");
    expect(html).toContain("data-umkm-edit-bridge");
    expect(html).toContain("umkmcepat-edit-mode");
    expect(html).toContain("umkmcepat-edit-hit-test");
    expect(html).toContain("umkmcepat-edit-target");
    expect(html).toContain("elementFromPoint");
    expect(html).toContain("umkm-edit-hover");
    expect(html).toContain("setHoverBox");
    expect(html).toContain('data-umkm-origin="*"');
    expect(html).toContain("umkmcepat-edit-action");
    expect(html).toContain("moveSelected");
    expect(html).toContain("data-umkm-id");
  });
  afterEach(async () => {
    vi.restoreAllMocks();

    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = null;
    }
  });

  describe("preview annotation element picking", () => {
    it("selects a nested heading instead of its large section", () => {
      const candidates = [
        { tag: "h1", text: "Servis motor panggilan" },
        {
          className: "hero-copy",
          tag: "div",
          text: "Servis motor panggilan",
        },
        {
          className: "hero-section",
          tag: "section",
          text: "Servis motor panggilan",
        },
        { tag: "main", text: "Servis motor panggilan" },
      ];

      expect(pickPreviewAnnotationCandidateIndex(candidates)).toBe(0);
    });

    it("selects paragraph text inside a card instead of the card", () => {
      const candidates = [
        { tag: "p", text: "Paket servis ringan untuk motor harian." },
        {
          className: "service-card-body",
          tag: "div",
          text: "Paket servis ringan untuk motor harian.",
        },
        {
          className: "service-card",
          tag: "article",
          text: "Paket servis ringan untuk motor harian.",
        },
      ];

      expect(pickPreviewAnnotationCandidateIndex(candidates)).toBe(0);
    });

    it("selects a button when clicking text or icon inside the button", () => {
      expect(
        pickPreviewAnnotationCandidateIndex([
          { ignored: true, tag: "svg" },
          { tag: "span", text: "Pesan sekarang" },
          {
            className: "primary-action",
            tag: "button",
            text: "Pesan sekarang",
          },
        ]),
      ).toBe(2);

      expect(
        pickPreviewAnnotationCandidateIndex([
          { tag: "span", text: "Pesan sekarang" },
          {
            className: "primary-action",
            tag: "button",
            text: "Pesan sekarang",
          },
        ]),
      ).toBe(1);
    });

    it("selects an image directly", () => {
      expect(
        pickPreviewAnnotationCandidateIndex([
          { tag: "img" },
          { tag: "section" },
        ]),
      ).toBe(0);
    });

    it("keeps the exact card padding element clicked", () => {
      expect(
        pickPreviewAnnotationCandidateIndex([
          { className: "card-padding", tag: "div" },
          { className: "product-card", tag: "article", text: "Paket hemat" },
        ]),
      ).toBe(0);
    });

    it("keeps a generic clicked element instead of climbing to its section", () => {
      expect(
        pickPreviewAnnotationCandidateIndex([
          { className: "hero-artwork", tag: "div" },
          { className: "hero-section", tag: "section" },
        ]),
      ).toBe(0);
    });
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

  it("injects an image-fallback listener into preview HTML", () => {
    const html = "<html><body><main></main></body></html>";
    const res = injectPreviewAnnotationBridge(html);
    expect(res).toContain("umkm-image-fallback");
    expect(res).toContain("addEventListener('error'");
  });

  it("injects an image-fallback listener into published HTML", () => {
    const html = "<html><head></head><body></body></html>";
    const res = injectPublishedHead(html, {
      businessName: "Usaha",
      noindex: false,
      slug: "usaha",
    });
    expect(res).toContain("umkm-image-fallback");
    expect(res).toContain("addEventListener('error'");
  });

  it("injects an image-fallback listener into bare published HTML without a head", () => {
    const html =
      '<script src="/p/usaha/assets/index.js"></script>\n<div id="root"></div>\n';
    const res = injectPublishedHead(html, {
      businessName: "Usaha",
      noindex: false,
      slug: "usaha",
    });
    expect(res).toContain("umkm-image-fallback");
    expect(res).toContain("addEventListener('error'");
  });

  it("builds an aspect-aware fallback script with data URIs", () => {
    const script = buildImageFallbackScript();
    expect(script).toContain("data-umkm-image-fallback");
    expect(script).toContain("addEventListener('error'");
    expect(script).toContain("style.display = 'none'");
  });

  it("picks a portrait data URI for tall images", () => {
    const dataUri = pickPlaceholderDataUri(200, 500);
    expect(dataUri).toContain("data:image");
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
    expect(result).not.toContain("/assets/app.js/?");
    expect(result).not.toContain("/assets/app.css/?");
    expect(result).toContain("assetToken=");
    expect(result).not.toContain("./assets/");
  });

  it("rewrites generated HTML asset URLs for public routes", () => {
    const html =
      '<script type="module" crossorigin src="./assets/app.js"></script><link rel="stylesheet" href="./assets/app.css">';
    const result = rewritePublicAssetUrls(
      html,
      "salon-kecantikan-wanita-zi8pc6",
    );

    expect(result).toContain("/p/salon-kecantikan-wanita-zi8pc6/assets/app.js");
    expect(result).toContain(
      "/p/salon-kecantikan-wanita-zi8pc6/assets/app.css",
    );
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

  it("escapes JSON-LD script tags inside head injection to prevent XSS", () => {
    const html = "<html><head></head><body></body></html>";
    const res = injectPublishedHead(html, {
      businessName: "Usaha </script><script>alert(1)</script>",
      noindex: false,
      slug: "test-shop",
    });
    expect(res).toContain('<script type="application/ld+json">');
    expect(res).toContain("Usaha <\\/script><script>alert(1)<\\/script>");
    expect(res).not.toContain("</script><script>");
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

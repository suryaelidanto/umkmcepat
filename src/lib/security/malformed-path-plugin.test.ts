import { describe, expect, it, vi } from "vitest";

import { installMalformedPathGuard } from "./malformed-path-plugin";

describe("malformed request path guard", () => {
  it("returns not found without invoking the application for malformed paths", async () => {
    const applicationFetch: (request: Request) => Promise<Response> = vi.fn(
      async (_request: Request) => new Response("application response"),
    );
    const app = { fetch: applicationFetch };
    installMalformedPathGuard(app);

    const response = await app.fetch(
      new Request("http://localhost/p/warung/%E0%A4%A"),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
    expect(applicationFetch).not.toHaveBeenCalled();
  });

  it("passes valid encoded paths to the application", async () => {
    const applicationFetch: (request: Request) => Promise<Response> = vi.fn(
      async (_request: Request) => new Response("application response"),
    );
    const app = { fetch: applicationFetch };
    installMalformedPathGuard(app);

    const request = new Request("http://localhost/p/warung/a%2Fb");
    const response = await app.fetch(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("application response");
    expect(applicationFetch).toHaveBeenCalledWith(request);
  });

  it("checks the raw node target when the adapter normalized the request URL", async () => {
    const applicationFetch: (request: Request) => Promise<Response> = vi.fn(
      async (_request: Request) => new Response("application response"),
    );
    const app = { fetch: applicationFetch };
    installMalformedPathGuard(app);

    const request = Object.assign(new Request("http://localhost/.env"), {
      runtime: { node: { req: { url: "/p/warung/%2e%2e/.env" } } },
    });
    const response = await app.fetch(request);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
    expect(applicationFetch).not.toHaveBeenCalled();
  });
});

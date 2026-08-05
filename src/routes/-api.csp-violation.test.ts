import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dev-log", () => ({
  devLog: vi.fn(),
}));

import { Route } from "./api.csp-violation";

import { devLog } from "@/lib/dev-log";

const devLogMock = vi.mocked(devLog);

const handler = (
  Route as unknown as {
    options: {
      server: {
        handlers: { POST: (ctx: { request: Request }) => Promise<Response> };
      };
    };
  }
).options.server.handlers.POST;

describe("POST /api/csp-violation", () => {
  beforeEach(() => {
    devLogMock.mockClear();
  });

  it("returns 200 for a valid JSON payload under 50 KB", async () => {
    const request = new Request("http://localhost/api/csp-violation", {
      body: JSON.stringify({
        "csp-report": { documentUri: "http://example.com" },
      }),
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "60",
      },
      method: "POST",
    });

    const response = await handler({ request });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ received: true });
    expect(devLogMock).toHaveBeenCalledWith(
      "csp-violation",
      "received",
      expect.any(Object),
    );
  });

  it("suppresses known report-only generated preview inline script noise", async () => {
    const request = new Request("http://localhost/api/csp-violation", {
      body: JSON.stringify({
        "csp-report": {
          "blocked-uri": "inline",
          disposition: "report",
          "document-uri":
            "https://dev.umkmcepat.com/api/projects/project_1/preview/?v=0",
          "effective-directive": "script-src-elem",
          "violated-directive": "script-src-elem",
        },
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const response = await handler({ request });

    expect(response.status).toBe(200);
    expect(devLogMock).not.toHaveBeenCalled();
  });

  it("returns 413 if payload content-length exceeds 50 KB", async () => {
    const request = new Request("http://localhost/api/csp-violation", {
      body: JSON.stringify({}),
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "51201",
      },
      method: "POST",
    });

    const response = await handler({ request });
    expect(response.status).toBe(413);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ error: "Payload too large." });
  });

  it("returns 400 for malformed JSON", async () => {
    const request = new Request("http://localhost/api/csp-violation", {
      body: "{invalid-json",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "13",
      },
      method: "POST",
    });

    const response = await handler({ request });
    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ error: "Invalid violation payload." });
  });

  it("returns 400 if JSON is not an object", async () => {
    const request = new Request("http://localhost/api/csp-violation", {
      body: "123",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "3",
      },
      method: "POST",
    });

    const response = await handler({ request });
    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ error: "Invalid violation payload." });
  });

  it("returns 400 if JSON is null", async () => {
    const request = new Request("http://localhost/api/csp-violation", {
      body: "null",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "4",
      },
      method: "POST",
    });

    const response = await handler({ request });
    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ error: "Invalid violation payload." });
  });

  it("returns 400 if JSON is an array", async () => {
    const request = new Request("http://localhost/api/csp-violation", {
      body: "[]",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "2",
      },
      method: "POST",
    });

    const response = await handler({ request });
    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ error: "Invalid violation payload." });
  });
});

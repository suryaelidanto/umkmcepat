import { Auth } from "@auth/core";
import { getRequest } from "@tanstack/react-start/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "@/lib/auth";

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: vi.fn(),
}));

vi.mock("@auth/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@auth/core")>();
  return {
    ...original,
    Auth: vi.fn(),
  };
});

describe("server-side auth() helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null if no request is active in TanStack server context", async () => {
    vi.mocked(getRequest).mockReturnValue(null as unknown as Request);

    const session = await auth();
    expect(session).toBeNull();
  });

  it("reconstructs action URL with proxy headers and forwards headers to Auth()", async () => {
    const mockRequest = new Request("http://localhost:3000/some-route", {
      headers: {
        cookie: "session-token=123",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "umkmcepat.com",
        host: "localhost:3000",
        "user-agent": "Mozilla/5.0",
      },
    });
    vi.mocked(getRequest).mockReturnValue(mockRequest);

    const mockSessionResponse = new Response(
      JSON.stringify({ user: { id: "user-1", name: "Jane" } }),
      { status: 200 },
    );
    vi.mocked(Auth).mockResolvedValue(mockSessionResponse);

    const session = await auth();

    expect(session).toEqual({ user: { id: "user-1", name: "Jane" } });

    expect(Auth).toHaveBeenCalledTimes(1);
    const subRequest = vi.mocked(Auth).mock.calls[0][0] as Request;

    expect(subRequest.url).toContain("https://umkmcepat.com/api/auth/session");
    expect(subRequest.headers.get("cookie")).toBe("session-token=123");
    expect(subRequest.headers.get("x-forwarded-proto")).toBe("https");
    expect(subRequest.headers.get("x-forwarded-host")).toBe("umkmcepat.com");
    expect(subRequest.headers.get("host")).toBe("localhost:3000");
    expect(subRequest.headers.has("content-type")).toBe(false);
  });
});

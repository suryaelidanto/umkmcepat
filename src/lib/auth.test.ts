import { AsyncLocalStorage } from "node:async_hooks";

import { Auth } from "@auth/core";
import { getRequest } from "@tanstack/react-start/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { auth, getAuthState, getAuthStore, requireNotBanned } from "@/lib/auth";

const prismaUserFindUniqueMock = vi.fn();

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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => prismaUserFindUniqueMock(...args),
    },
  },
}));

describe("server-side auth() helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.__authStore = new AsyncLocalStorage<Map<string, unknown>>();
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
    prismaUserFindUniqueMock.mockResolvedValue({ bannedAt: null });

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
    expect(prismaUserFindUniqueMock).toHaveBeenCalledWith({
      select: { bannedAt: true },
      where: { id: "user-1" },
    });
  });

  it("returns null when the session user is banned", async () => {
    const mockRequest = new Request("http://localhost:3000/some-route", {
      headers: { cookie: "session-token=123" },
    });
    vi.mocked(getRequest).mockReturnValue(mockRequest);

    const mockSessionResponse = new Response(
      JSON.stringify({ user: { id: "banned-user", name: "Banned" } }),
      { status: 200 },
    );
    vi.mocked(Auth).mockResolvedValue(mockSessionResponse);
    prismaUserFindUniqueMock.mockResolvedValue({
      bannedAt: new Date("2026-01-01"),
    });

    const session = await auth();

    expect(session).toBeNull();
    expect(prismaUserFindUniqueMock).toHaveBeenCalledWith({
      select: { bannedAt: true },
      where: { id: "banned-user" },
    });
  });
});

describe("getAuthState()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.__authStore = new AsyncLocalStorage<Map<string, unknown>>();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns guest state when no request is active", async () => {
    vi.mocked(getRequest).mockReturnValue(null as unknown as Request);

    const state = await getAuthState();

    expect(state).toEqual({ session: null, banned: false });
  });

  it("returns unauthenticated guest when auth() resolves to null", async () => {
    vi.mocked(getRequest).mockReturnValue(
      new Request("http://localhost:3000/x") as unknown as Request,
    );
    vi.mocked(Auth).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const state = await getAuthState();

    expect(state).toEqual({ session: null, banned: false });
  });

  it("returns guest state when the session has no user id", async () => {
    vi.mocked(getRequest).mockReturnValue(
      new Request("http://localhost:3000/x") as unknown as Request,
    );
    vi.mocked(Auth).mockResolvedValue(
      new Response(JSON.stringify({ expires: "2026-09-12T22:58:18.342Z" }), {
        status: 200,
      }),
    );

    const state = await getAuthState();

    expect(state).toEqual({ session: null, banned: false });
    expect(prismaUserFindUniqueMock).not.toHaveBeenCalled();
  });

  it("returns non-banned authed state when bannedAt is null", async () => {
    const mockRequest = new Request("http://localhost:3000/x", {
      headers: { cookie: "session-token=123" },
    });
    vi.mocked(getRequest).mockReturnValue(mockRequest);
    vi.mocked(Auth).mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "u-1", name: "Jane" } }), {
        status: 200,
      }),
    );
    prismaUserFindUniqueMock.mockResolvedValue({ bannedAt: null });

    const state = await getAuthState();

    expect(state).toEqual({
      session: { user: { id: "u-1", name: "Jane" } },
      banned: false,
    });
  });

  it("returns banned authed state when bannedAt is set", async () => {
    const mockRequest = new Request("http://localhost:3000/x", {
      headers: { cookie: "session-token=123" },
    });
    vi.mocked(getRequest).mockReturnValue(mockRequest);
    vi.mocked(Auth).mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "u-1", name: "Jane" } }), {
        status: 200,
      }),
    );
    prismaUserFindUniqueMock.mockResolvedValue({
      bannedAt: new Date("2026-01-01"),
    });

    const state = await getAuthState();

    expect(state.banned).toBe(true);
    expect(state.session).toEqual({ user: { id: "u-1", name: "Jane" } });
  });
});

describe("requireNotBanned()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.__authStore = new AsyncLocalStorage<Map<string, unknown>>();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when session is null", async () => {
    await expect(requireNotBanned(null)).resolves.toBeUndefined();
    expect(prismaUserFindUniqueMock).not.toHaveBeenCalled();
  });

  it("does nothing when the user is not banned", async () => {
    prismaUserFindUniqueMock.mockResolvedValue({ bannedAt: null });

    await expect(
      requireNotBanned({ user: { id: "u-1" } } as never),
    ).resolves.toBeUndefined();
  });

  it("throws a redirect Response when the user is banned", async () => {
    prismaUserFindUniqueMock.mockResolvedValue({
      bannedAt: new Date("2026-01-01"),
    });

    try {
      await requireNotBanned({ user: { id: "u-1" } } as never);
      expect.fail("expected requireNotBanned to throw");
    } catch (thrown) {
      // TanStack Router's redirect() packages the destination into a Response
      // that the framework intercepts; the Response itself is the marker.
      expect(thrown).toBeInstanceOf(Response);
      expect((thrown as Response).status).toBe(307);
    }
  });
});

describe("per-request auth memoization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.__authStore = new AsyncLocalStorage<Map<string, unknown>>();
  });

  it("resolves the session only once within a request scope", async () => {
    const mockRequest = new Request("http://localhost:3000/", {
      headers: { cookie: "session-token=123" },
    });
    vi.mocked(getRequest).mockReturnValue(mockRequest);
    const mockSessionResponse = new Response(
      JSON.stringify({ user: { id: "user-1", name: "Jane" } }),
      { status: 200 },
    );
    vi.mocked(Auth).mockResolvedValue(mockSessionResponse as never);

    await getAuthStore().run(new Map(), async () => {
      const first = await getAuthState();
      const second = await getAuthState();

      expect(first).toEqual(second);
      expect(first.session?.user?.id).toBe("user-1");
      expect(vi.mocked(Auth)).toHaveBeenCalledTimes(1);
    });
  });

  it("does not leak the memo across request scopes", async () => {
    const mockRequest = new Request("http://localhost:3000/", {
      headers: { cookie: "session-token=123" },
    });
    vi.mocked(getRequest).mockReturnValue(mockRequest);
    vi.mocked(Auth).mockImplementation(async () => {
      return new Response(
        JSON.stringify({ user: { id: "user-1", name: "Jane" } }),
        { status: 200 },
      ) as never;
    });

    await getAuthStore().run(new Map(), () => getAuthState());
    await getAuthStore().run(new Map(), () => getAuthState());

    expect(vi.mocked(Auth)).toHaveBeenCalledTimes(2);
  });
});

import { describe, expect, it, vi } from "vitest";

const { authMock, moderateProjectRequestMock, validateProjectRequestMock } =
  vi.hoisted(() => ({
    authMock: vi.fn<() => Promise<unknown>>(async () => ({
      user: { id: "user_1" },
      expires: new Date().toISOString(),
    })),
    moderateProjectRequestMock: vi.fn(async () => ({ allowed: true })),
    validateProjectRequestMock: vi.fn((prompt: string) =>
      prompt.length > 1200
        ? {
            ok: false,
            message: "Maksimal 1.200 karakter. Ringkas sedikit, ya.",
          }
        : { ok: true, value: prompt.trim() },
    ),
  }));

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/ai-moderation", () => ({
  moderateProjectRequest: moderateProjectRequestMock,
}));

vi.mock("@/lib/projects/input", () => ({
  validateProjectRequest: validateProjectRequestMock,
}));

import { POST } from "./route";

describe("project moderation route", () => {
  it("requires login", async () => {
    authMock.mockResolvedValueOnce(null);

    const response = await POST(
      new Request("http://localhost/api/projects/moderate", {
        method: "POST",
        body: JSON.stringify({ prompt: "Saya jual kopi" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects invalid requests before calling AI", async () => {
    const response = await POST(
      new Request("http://localhost/api/projects/moderate", {
        method: "POST",
        body: JSON.stringify({ prompt: "a".repeat(1201) }),
      }),
    );

    expect(response.status).toBe(400);
    expect(moderateProjectRequestMock).not.toHaveBeenCalled();
  });

  it("returns AI moderation result", async () => {
    moderateProjectRequestMock.mockResolvedValueOnce({ allowed: true });

    const response = await POST(
      new Request("http://localhost/api/projects/moderate", {
        method: "POST",
        body: JSON.stringify({ prompt: "Saya jual kopi" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ allowed: true });
  });
});

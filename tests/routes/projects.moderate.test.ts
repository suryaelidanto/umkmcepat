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

vi.mock("@/lib/user-credits", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/user-credits")>(
      "@/lib/user-credits",
    );

  return {
    ...actual,
    checkEnergy: vi.fn(async () => ({ allowed: true, remaining: 200_000 })),
    addEnergyUsage: vi.fn(async () => ({
      energyUsed: 0,
      inputTokens: 0,
      outputTokens: 0,
    })),
    chargeEnergyForAiUsage: vi.fn(async () => ({
      energyUsed: 0,
      inputTokens: 0,
      outputTokens: 0,
    })),
  };
});

import { getHandler } from "./_handler";

import { Route } from "@/routes/api.projects.moderate";

const POST = getHandler(Route, "POST");

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

  it("returns a retryable failure when moderation is unavailable", async () => {
    moderateProjectRequestMock.mockRejectedValueOnce(
      new Error("provider down"),
    );

    const response = await POST(
      new Request("http://localhost/api/projects/moderate", {
        method: "POST",
        body: JSON.stringify({ prompt: "Saya jual kopi" }),
      }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    expect(await response.json()).toMatchObject({
      allowed: false,
      code: "moderation_unavailable",
    });
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

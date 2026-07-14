import { beforeEach, describe, expect, it, vi } from "vitest";

const { moderateProjectRequestMock } = vi.hoisted(() => ({
  moderateProjectRequestMock: vi.fn(),
}));

vi.mock("@/lib/ai-moderation", () => ({
  moderateProjectRequest: moderateProjectRequestMock,
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => null),
}));

import { getHandler } from "./_handler";

import { Route } from "@/routes/api.moderation.project-request";

const POST = getHandler(Route, "POST");

describe("public project moderation route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a retryable failure instead of an invented moderation result", async () => {
    moderateProjectRequestMock.mockRejectedValueOnce(
      new Error("provider down"),
    );

    const response = await POST(
      new Request("http://localhost/api/moderation/project-request", {
        method: "POST",
        body: JSON.stringify({ prompt: "Saya jual kopi" }),
      }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    await expect(response.json()).resolves.toMatchObject({
      allowed: false,
      code: "moderation_unavailable",
    });
  });
});

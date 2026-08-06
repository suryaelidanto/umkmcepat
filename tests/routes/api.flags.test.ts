import { afterEach, describe, expect, it, vi } from "vitest";

const { getPublicFlagsMock } = vi.hoisted(() => ({
  getPublicFlagsMock: vi.fn(),
}));

vi.mock("@/lib/feature-flags", () => ({
  getPublicFlags: getPublicFlagsMock,
}));

import { getHandler } from "./_handler";

import { Route } from "@/routes/api.flags";

const GET = getHandler(Route, "GET");

describe("GET /api/flags", () => {
  afterEach(() => {
    getPublicFlagsMock.mockReset();
  });

  it("returns 200 with both flags and a public cache header", async () => {
    getPublicFlagsMock.mockResolvedValue({
      "feature.composer_uploads_enabled": true,
      "feature.direct_edit_enabled": false,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=30, s-maxage=30",
    );

    const body = await response.json();
    expect(body).toEqual({
      "feature.composer_uploads_enabled": true,
      "feature.direct_edit_enabled": false,
    });
  });
});

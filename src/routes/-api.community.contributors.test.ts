import { afterEach, describe, expect, it, vi } from "vitest";

const { getCommunityContributorsCachedMock } = vi.hoisted(() => ({
  getCommunityContributorsCachedMock: vi.fn(),
}));

vi.mock("@/lib/community-contributors", () => ({
  getCommunityContributorsCached: getCommunityContributorsCachedMock,
}));

import { getHandler } from "../../tests/support/route-handler";

import { Route } from "@/routes/api.community.contributors";

const GET = getHandler(Route, "GET");

describe("GET /api/community/contributors", () => {
  afterEach(() => {
    getCommunityContributorsCachedMock.mockReset();
  });

  it("returns the cached contributors with a public cache header", async () => {
    getCommunityContributorsCachedMock.mockResolvedValue([
      { login: "suryaelidanto" },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=900, s-maxage=900",
    );
    expect(await response.json()).toEqual([{ login: "suryaelidanto" }]);
  });
});

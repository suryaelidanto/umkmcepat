import { describe, expect, it } from "vitest";

import { getHandler } from "./_handler";

import { Route } from "@/routes/api.health.live";

const GET = getHandler(Route, "GET");

describe("liveness route", () => {
  it("reports process liveness without caching", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});

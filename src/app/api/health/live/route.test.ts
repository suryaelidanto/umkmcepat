import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("liveness route", () => {
  it("reports process liveness without caching", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});

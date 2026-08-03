import { afterEach, describe, expect, it, vi } from "vitest";

import {
  listNineRouterModels,
  resetNineRouterModelsCacheForTests,
} from "./nine-router-models";

describe("listNineRouterModels", () => {
  afterEach(() => {
    resetNineRouterModelsCacheForTests();
    vi.restoreAllMocks();
    delete process.env.NINE_ROUTER_BASE_URL;
    delete process.env.NINE_ROUTER_API_KEY;
  });

  it("returns sorted unique ids from OpenAI-style list", async () => {
    process.env.NINE_ROUTER_BASE_URL = "http://9router.test/v1";
    process.env.NINE_ROUTER_API_KEY = "key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        data: [
          { id: "z-model" },
          { id: "a-combo" },
          { id: "a-combo" },
          { id: "  " },
          {},
        ],
      }),
    );
    await expect(listNineRouterModels()).resolves.toEqual([
      "a-combo",
      "z-model",
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://9router.test/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer key",
        }),
      }),
    );
  });

  it("returns empty array when env missing or fetch fails", async () => {
    await expect(listNineRouterModels()).resolves.toEqual([]);
    process.env.NINE_ROUTER_BASE_URL = "http://9router.test/v1";
    process.env.NINE_ROUTER_API_KEY = "key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 }),
    );
    await expect(listNineRouterModels()).resolves.toEqual([]);
  });

  it("caches results within TTL", async () => {
    process.env.NINE_ROUTER_BASE_URL = "http://9router.test/v1";
    process.env.NINE_ROUTER_API_KEY = "key";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ data: [{ id: "one" }] }));
    await listNineRouterModels();
    await listNineRouterModels();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

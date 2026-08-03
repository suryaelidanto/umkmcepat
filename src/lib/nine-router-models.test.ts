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

  it("returns only owned_by combo ids, sorted unique", async () => {
    process.env.NINE_ROUTER_BASE_URL = "http://9router.test/v1";
    process.env.NINE_ROUTER_API_KEY = "key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        data: [
          { id: "z-combo", owned_by: "combo" },
          { id: "a-combo", owned_by: "combo" },
          { id: "a-combo", owned_by: "combo" },
          { id: "cmc/deepseek/x", owned_by: "cmc" },
          { id: "openrouter/y", owned_by: "openrouter" },
          { id: "  ", owned_by: "combo" },
          { owned_by: "combo" },
        ],
      }),
    );
    await expect(listNineRouterModels()).resolves.toEqual([
      "a-combo",
      "z-combo",
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
      .mockResolvedValue(
        Response.json({ data: [{ id: "one", owned_by: "combo" }] }),
      );
    await listNineRouterModels();
    await listNineRouterModels();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  findUniqueMock,
  findManyMock,
  upsertMock,
  fetchMock,
} = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  findManyMock: vi.fn(),
  upsertMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    modelPricing: {
      findUnique: findUniqueMock,
      findMany: findManyMock,
      upsert: upsertMock,
    },
  },
}));

import {
  CONSERVATIVE_DEFAULT_PRICE,
  getModelPricing,
  normalizeOpenRouterModelId,
} from "./model-pricing";

const FRESH = {
  modelId: "minimax/minimax-m3",
  promptPrice: 0.0000003,
  completionPrice: 0.0000012,
  fetchedAt: new Date(),
};

const STALE = {
  ...FRESH,
  fetchedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
};

describe("normalizeOpenRouterModelId", () => {
  it("strips gateway prefixes", () => {
    expect(normalizeOpenRouterModelId("openrouter/minimax/minimax-m3")).toBe(
      "minimax/minimax-m3",
    );
    expect(normalizeOpenRouterModelId("cmc/deepseek/deepseek-v4-pro")).toBe(
      "deepseek/deepseek-v4-pro",
    );
  });

  it("maps empty to unknown", () => {
    expect(normalizeOpenRouterModelId("")).toBe("unknown");
    expect(normalizeOpenRouterModelId("   ")).toBe("unknown");
  });
});

describe("getModelPricing", () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    findManyMock.mockReset();
    upsertMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns fresh cache without network", async () => {
    findUniqueMock.mockResolvedValueOnce(FRESH);
    const price = await getModelPricing("openrouter/minimax/minimax-m3");
    expect(price).toEqual({
      promptPrice: 0.0000003,
      completionPrice: 0.0000012,
    });
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { modelId: "minimax/minimax-m3" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches single-model endpoint when cache is stale", async () => {
    findUniqueMock.mockResolvedValueOnce(STALE);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          pricing: { prompt: "0.0000004", completion: "0.0000015" },
        },
      }),
    });
    upsertMock.mockResolvedValueOnce({});

    const price = await getModelPricing("minimax/minimax-m3");
    expect(price).toEqual({
      promptPrice: 0.0000004,
      completionPrice: 0.0000015,
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/api/v1/model/minimax/minimax-m3",
    );
  });

  it("uses conservative floor when no cache and fetches fail", async () => {
    findUniqueMock.mockResolvedValue(null);
    fetchMock
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false });
    findManyMock.mockResolvedValueOnce([]);

    const price = await getModelPricing("unknown/model");
    expect(price).toEqual(CONSERVATIVE_DEFAULT_PRICE);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("dedupes concurrent refreshes for the same model", async () => {
    findUniqueMock.mockResolvedValue(null);
    let resolveFetch: (value: unknown) => void = () => {};
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    fetchMock.mockReturnValue(fetchPromise);
    upsertMock.mockResolvedValue({});

    const a = getModelPricing("minimax/minimax-m3");
    // Let first call pass findUnique and register inflight before second starts.
    await Promise.resolve();
    await Promise.resolve();
    const b = getModelPricing("openrouter/minimax/minimax-m3");
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({
      ok: true,
      json: async () => ({
        data: {
          pricing: { prompt: "0.0000003", completion: "0.0000012" },
        },
      }),
    });

    const [pa, pb] = await Promise.all([a, b]);
    expect(pa).toEqual(pb);
    expect(pa.promptPrice).toBe(0.0000003);
  });
});

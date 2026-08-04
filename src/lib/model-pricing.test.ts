import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findUniqueMock, findManyMock, upsertMock, fetchMock } = vi.hoisted(
  () => ({
    findUniqueMock: vi.fn(),
    findManyMock: vi.fn(),
    upsertMock: vi.fn(),
    fetchMock: vi.fn(),
  }),
);

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
  resolveModelPricing,
} from "./model-pricing";

const FRESH = {
  modelId: "xiaomi/mimo-v2",
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
    const price = await getModelPricing("openrouter/xiaomi/mimo-v2");
    expect(price).toEqual({
      promptPrice: 0.0000003,
      completionPrice: 0.0000012,
    });
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { modelId: "xiaomi/mimo-v2" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns manual override pricing with proof for CMC model ids", async () => {
    const price = await resolveModelPricing("cmc/MiniMaxAI/MiniMax-M3");

    expect(price).toEqual({
      rawModelId: "cmc/MiniMaxAI/MiniMax-M3",
      pricedModelId: "minimax/minimax-m3",
      pricingSource: "manual-override",
      promptPrice: 0.0000003,
      completionPrice: 0.0000012,
    });
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns manual override pricing for openrouter/* ids when present", async () => {
    const price = await resolveModelPricing("openrouter/minimax/minimax-m3");

    expect(price).toEqual({
      rawModelId: "openrouter/minimax/minimax-m3",
      pricedModelId: "minimax/minimax-m3",
      pricingSource: "manual-override",
      promptPrice: 0.0000003,
      completionPrice: 0.0000012,
    });
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("returns manual override pricing for every hedged combo primary", async () => {
    const cases = [
      ["openrouter/xiaomi/mimo-v2.5", 0.00000014, 0.00000028],
      ["openrouter/z-ai/glm-4.6v", 0.0000003, 0.0000009],
      ["openrouter/moonshotai/kimi-k2.6", 0.000000589, 0.00000248],
    ] as const;
    for (const [id, promptPrice, completionPrice] of cases) {
      const price = await resolveModelPricing(id);
      expect(price.pricingSource).toBe("manual-override");
      expect(price.promptPrice).toBe(promptPrice);
      expect(price.completionPrice).toBe(completionPrice);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("matches OpenRouter hugging_face_id aliases from the full model list", async () => {
    findUniqueMock.mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "minimax/minimax-m3",
            canonical_slug: "minimax/minimax-m3-20260531",
            hugging_face_id: "MiniMaxAI/Minimax-M3",
            name: "MiniMax: MiniMax M3",
            pricing: { prompt: "0.0000003", completion: "0.0000012" },
          },
        ],
      }),
    });
    upsertMock.mockResolvedValueOnce({});

    const price = await resolveModelPricing("MiniMaxAI/MiniMax-M3");

    expect(price).toMatchObject({
      rawModelId: "MiniMaxAI/MiniMax-M3",
      pricedModelId: "minimax/minimax-m3",
      pricingSource: "openrouter-refresh",
      promptPrice: 0.0000003,
      completionPrice: 0.0000012,
    });
  });

  it("warns once for an unresolved model and uses conservative floor", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    findUniqueMock.mockResolvedValue(null);
    fetchMock.mockResolvedValue({ ok: false });

    const first = await resolveModelPricing("unknown/model");
    const second = await resolveModelPricing("unknown/model");

    expect(first).toEqual({
      rawModelId: "unknown/model",
      pricedModelId: "unknown",
      pricingSource: "conservative-floor",
      ...CONSERVATIVE_DEFAULT_PRICE,
    });
    expect(second.pricingSource).toBe("conservative-floor");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(upsertMock).not.toHaveBeenCalled();
    warn.mockRestore();
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

    const price = await getModelPricing("xiaomi/mimo-v2");
    expect(price).toEqual({
      promptPrice: 0.0000004,
      completionPrice: 0.0000015,
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/api/v1/model/xiaomi/mimo-v2",
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

    const a = getModelPricing("xiaomi/mimo-v2");
    // Let first call pass findUnique and register inflight before second starts.
    await Promise.resolve();
    await Promise.resolve();
    const b = getModelPricing("openrouter/xiaomi/mimo-v2");
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

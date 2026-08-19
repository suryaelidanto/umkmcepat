import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CONSERVATIVE_DEFAULT_PRICE,
  getModelPricing,
  normalizeProviderModelId,
  resolveModelPricing,
} from "./model-pricing";
import modelPricing from "./model-pricing.json";

describe("normalizeProviderModelId", () => {
  it("preserves qualified providers and treats bare legacy ids as OpenRouter", () => {
    expect(normalizeProviderModelId("cmc/deepseek/deepseek-v4-pro")).toBe(
      "cmc/deepseek/deepseek-v4-pro",
    );
    expect(normalizeProviderModelId("openrouter/minimax/minimax-m3")).toBe(
      "openrouter/minimax/minimax-m3",
    );
    expect(normalizeProviderModelId("minimax/minimax-m3")).toBe(
      "openrouter/minimax/minimax-m3",
    );
    expect(normalizeProviderModelId("future/model-x")).toBe(
      "openrouter/future/model-x",
    );
    expect(normalizeProviderModelId(" ")).toBe("unknown");
  });
});

describe("resolveModelPricing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the provider-qualified JSON catalog without DB or network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resolveModelPricing("cmc/deepseek/deepseek-v4-pro"),
    ).resolves.toMatchObject({
      pricedModelId: "cmc/deepseek/deepseek-v4-pro",
      pricingSource: "catalog",
      promptPrice: 0.00000066,
      completionPrice: 0.00000198,
    });
    await expect(
      resolveModelPricing("openrouter/minimax/minimax-m3"),
    ).resolves.toMatchObject({
      pricedModelId: "openrouter/minimax/minimax-m3",
      pricingSource: "catalog",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps legacy bare OpenRouter ids compatible", async () => {
    const qualified = await resolveModelPricing(
      "openrouter/minimax/minimax-m3",
    );
    const legacy = await resolveModelPricing("minimax/minimax-m3");
    expect(legacy).toMatchObject({
      rawModelId: "minimax/minimax-m3",
      pricedModelId: "openrouter/minimax/minimax-m3",
      promptPrice: qualified.promptPrice,
      completionPrice: qualified.completionPrice,
      pricingSource: "catalog",
    });
  });

  it("uses the conservative floor for unknown models", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(resolveModelPricing("new-provider/model-x")).resolves.toEqual({
      rawModelId: "new-provider/model-x",
      pricedModelId: "unknown",
      pricingSource: "conservative-floor",
      ...CONSERVATIVE_DEFAULT_PRICE,
    });
    await expect(getModelPricing("new-provider/model-x")).resolves.toEqual(
      CONSERVATIVE_DEFAULT_PRICE,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("contains the complete fetched provider catalogs", () => {
    const ids = Object.keys(modelPricing);
    expect(
      ids.filter((id) => id.startsWith("cmc/")).length,
    ).toBeGreaterThanOrEqual(54);
    expect(
      ids.filter((id) => id.startsWith("openrouter/")).length,
    ).toBeGreaterThanOrEqual(400);
    for (const [id, entry] of Object.entries(modelPricing)) {
      expect(entry.sourceModelId).toBe(id);
      expect(entry.promptPrice).toBeGreaterThanOrEqual(0);
      expect(entry.completionPrice).toBeGreaterThanOrEqual(0);
      expect(entry.checkedAt).toBeDefined();
    }
  });
});

import modelPricing from "./model-pricing.json";

export type ModelPrice = { promptPrice: number; completionPrice: number };

export type PricingSource = "catalog" | "conservative-floor";

export type ResolvedModelPricing = ModelPrice & {
  rawModelId: string;
  pricedModelId: string;
  pricingSource: PricingSource;
};

type CatalogEntry = ModelPrice & {
  sourceModelId: string;
  source: string;
  checkedAt: string;
};

const catalog = modelPricing as Record<string, CatalogEntry>;
const unresolvedWarnings = new Set<string>();

export const CONSERVATIVE_DEFAULT_PRICE: ModelPrice = {
  promptPrice: 0.0000015,
  completionPrice: 0.0000019,
};

export function normalizeProviderModelId(modelId: string): string {
  const id = modelId.trim();
  if (!id) {
    return "unknown";
  }
  const parts = id.split("/");
  return parts.length >= 3
    ? id.toLowerCase()
    : `openrouter/${id.toLowerCase()}`;
}

function warnUnresolvedModel(rawModelId: string): void {
  if (unresolvedWarnings.has(rawModelId)) {
    return;
  }
  unresolvedWarnings.add(rawModelId);
  console.warn(
    `[model-pricing] unresolved model "${rawModelId}" — using conservative floor; add src/lib/model-pricing.json entry`,
  );
}

export async function resolveModelPricing(
  modelId: string,
): Promise<ResolvedModelPricing> {
  const rawModelId = modelId.trim() || "unknown";
  const key = normalizeProviderModelId(rawModelId);
  const entry = catalog[key];
  if (entry) {
    return {
      rawModelId,
      pricedModelId: key,
      pricingSource: "catalog",
      promptPrice: entry.promptPrice,
      completionPrice: entry.completionPrice,
    };
  }
  warnUnresolvedModel(rawModelId);
  return {
    rawModelId,
    pricedModelId: "unknown",
    pricingSource: "conservative-floor",
    ...CONSERVATIVE_DEFAULT_PRICE,
  };
}

export async function getModelPricing(modelId: string): Promise<ModelPrice> {
  const { promptPrice, completionPrice } = await resolveModelPricing(modelId);
  return { promptPrice, completionPrice };
}

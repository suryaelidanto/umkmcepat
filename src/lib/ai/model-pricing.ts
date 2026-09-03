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
  promptPrice: 0.0000003,
  completionPrice: 0.000001,
};

export function normalizeProviderModelId(modelId: string): string {
  const id = modelId.trim().toLowerCase();
  if (!id) {
    return "unknown";
  }
  const parts = id.split("/");
  return parts.length >= 3 ? id : `openrouter/${id}`;
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

export function findCatalogEntry(rawModelId: string): CatalogEntry | null {
  const trimmed = rawModelId.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  // Exact key match
  if (catalog[trimmed]) {
    return catalog[trimmed];
  }
  // Try normalized provider key
  const normalized = normalizeProviderModelId(trimmed);
  if (catalog[normalized]) {
    return catalog[normalized];
  }
  // Suffix fallback for vendor-prefixed model identifiers.
  for (const [key, entry] of Object.entries(catalog)) {
    if (key.endsWith(`/${trimmed}`) || key === trimmed) {
      return entry;
    }
  }
  return null;
}

export async function resolveModelPricing(
  modelId: string,
): Promise<ResolvedModelPricing> {
  const rawModelId = modelId.trim() || "unknown";
  const entry = findCatalogEntry(rawModelId);
  if (entry) {
    return {
      rawModelId,
      pricedModelId: entry.sourceModelId || rawModelId,
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

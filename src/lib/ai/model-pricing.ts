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
  let id = modelId.trim().toLowerCase();
  if (!id) {
    return "unknown";
  }
  // Strip proxy provider prefixes (e.g. "ag/", "antigravity/")
  if (id.startsWith("ag/")) {
    id = id.slice(3);
  } else if (id.startsWith("antigravity/")) {
    id = id.slice(12);
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
  let trimmed = rawModelId.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  // Strip ag/ or antigravity/ prefixes
  if (trimmed.startsWith("ag/")) {
    trimmed = trimmed.slice(3);
  } else if (trimmed.startsWith("antigravity/")) {
    trimmed = trimmed.slice(12);
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
  // Try matching suffix (e.g. "gpt-5.6-luna" matches "cmc/openai/gpt-5.6-luna" or "openrouter/openai/gpt-5.6-luna")
  for (const [key, entry] of Object.entries(catalog)) {
    if (key.endsWith(`/${trimmed}`) || key === trimmed) {
      return entry;
    }
  }
  // Try matching with common suffixes stripped (e.g. "-tiered", "-latest", "-preview")
  const baseTrimmed = trimmed.replace(/-(?:tiered|latest|preview|free)$/, "");
  if (baseTrimmed !== trimmed) {
    if (catalog[baseTrimmed]) {
      return catalog[baseTrimmed];
    }
    const baseNormalized = normalizeProviderModelId(baseTrimmed);
    if (catalog[baseNormalized]) {
      return catalog[baseNormalized];
    }
    for (const [key, entry] of Object.entries(catalog)) {
      if (key.endsWith(`/${baseTrimmed}`) || key === baseTrimmed) {
        return entry;
      }
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

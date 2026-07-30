import overrides from "../../config/model-pricing-overrides.json";

import { prisma } from "@/lib/prisma";

/**
 * Real USD-per-token pricing for OpenRouter models, cached in Postgres
 * (`ModelPricing`) so generation requests never wait on a pricing fetch.
 *
 * Fallback chain when a model's price is missing or stale:
 *   1. Single-model OpenRouter endpoint (small, fast).
 *   2. Full model list (covers id/alias mismatches).
 *   3. Existing stale cache row for this model, if any.
 *   4. CONSERVATIVE_DEFAULT_PRICE — never free (never {0,0}).
 *
 * The previous "max-known fallback" (Math.max across all cached models) was
 * removed: it combined the worst promptPrice from one model with the worst
 * completionPrice from another, producing an unrealistic price that inflated
 * energy estimates by orders of magnitude (e.g. gemini-3-flash → ~8.8M energy).
 */

const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";
const FETCH_TIMEOUT_MS = 5_000;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

// Warms the cache on boot. Not a hard filter — any other model id seen in
// real traffic is priced on-demand automatically.
export const SEED_MODEL_IDS = [
  "minimax/minimax-m3",
  "stepfun/step-3.7-flash",
  "qwen/qwen3-235b-a22b-thinking-2507",
  "deepseek/deepseek-v4-pro",
  "xiaomi/mimo-v2.5-pro",
  "google/gemini-3.1-flash-lite",
  "qwen/qwen3-vl-235b-a22b-instruct",
];

export type ModelPrice = { promptPrice: number; completionPrice: number };

export type PricingSource =
  | "manual-override"
  | "openrouter-cache"
  | "openrouter-refresh"
  | "conservative-floor";

export type ResolvedModelPricing = ModelPrice & {
  rawModelId: string;
  pricedModelId: string;
  pricingSource: PricingSource;
};

type PricingOverride = {
  sourceModelId?: string;
  openRouterModelId?: string | null;
  promptPrice?: number | null;
  completionPrice?: number | null;
};

const pricingOverrides = overrides as Record<string, PricingOverride>;
const unresolvedWarnings = new Set<string>();

/**
 * Pessimistic floor when OpenRouter is unreachable and cache is empty.
 * ~top of combo band (qwen-vl completion / thinking prompt). Never free.
 */
export const CONSERVATIVE_DEFAULT_PRICE: ModelPrice = {
  promptPrice: 0.0000015,
  completionPrice: 0.0000019,
};

/**
 * Strip gateway prefixes so cache keys match bare OpenRouter ids.
 * Callers may pass raw `response.modelId` (openrouter/…, cmc/…).
 */
export function normalizeOpenRouterModelId(modelId: string): string {
  let id = modelId.trim();
  if (!id) {
    return "unknown";
  }
  const lower = id.toLowerCase();
  for (const prefix of ["openrouter/", "cmc/"]) {
    if (lower.startsWith(prefix)) {
      id = id.slice(prefix.length);
      break;
    }
  }
  return id || "unknown";
}

function hasManualPrice(
  entry: PricingOverride | undefined,
): entry is PricingOverride & ModelPrice {
  if (!entry) {
    return false;
  }
  return (
    Number.isFinite(entry.promptPrice) &&
    Number.isFinite(entry.completionPrice) &&
    Number(entry.promptPrice) >= 0 &&
    Number(entry.completionPrice) >= 0
  );
}

function foldedModelKey(modelId: string): string {
  return modelId.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function modelMetadataKeys(raw: unknown): string[] {
  const model = raw as {
    id?: string;
    canonical_slug?: string;
    hugging_face_id?: string;
    name?: string;
  };
  return [model.id, model.canonical_slug, model.hugging_face_id, model.name]
    .filter((value): value is string => Boolean(value?.trim()))
    .flatMap((value) => [value, value.toLowerCase(), foldedModelKey(value)]);
}

function warnUnresolvedModel(rawModelId: string) {
  if (unresolvedWarnings.has(rawModelId)) {
    return;
  }
  unresolvedWarnings.add(rawModelId);
  console.warn(
    `[model-pricing] unresolved model "${rawModelId}" — using conservative floor; add config/model-pricing-overrides.json entry`,
  );
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function parsePricing(raw: unknown): ModelPrice | null {
  const pricing = (raw as { pricing?: Record<string, string> } | null)?.pricing;
  const prompt = Number(pricing?.prompt);
  const completion = Number(pricing?.completion);
  if (!Number.isFinite(prompt) || !Number.isFinite(completion)) {
    return null;
  }
  if (prompt < 0 || completion < 0) {
    return null;
  }
  return { promptPrice: prompt, completionPrice: completion };
}

async function fetchSingleModel(modelId: string): Promise<ModelPrice | null> {
  try {
    const res = await fetchWithTimeout(
      `${OPENROUTER_API_BASE}/model/${modelId}`,
    );
    if (!res.ok) {
      return null;
    }
    const body = await res.json();
    return parsePricing(body?.data);
  } catch {
    return null;
  }
}

async function fetchFromFullList(
  modelId: string,
): Promise<(ModelPrice & { modelId: string }) | null> {
  try {
    const res = await fetchWithTimeout(`${OPENROUTER_API_BASE}/models`);
    if (!res.ok) {
      return null;
    }
    const body = await res.json();
    const lookupKeys = new Set([
      modelId,
      modelId.toLowerCase(),
      foldedModelKey(modelId),
    ]);
    const match = (body?.data as unknown[] | undefined)?.find((m) =>
      modelMetadataKeys(m).some((key) => lookupKeys.has(key)),
    ) as { id?: string } | undefined;
    const price = parsePricing(match);
    if (!match?.id || !price) {
      return null;
    }
    return { modelId: match.id, ...price };
  } catch {
    return null;
  }
}

async function getStaleCacheRow(modelId: string): Promise<ModelPrice | null> {
  const row = await prisma.modelPricing.findUnique({ where: { modelId } });
  if (!row) {
    return null;
  }
  return {
    promptPrice: Number(row.promptPrice),
    completionPrice: Number(row.completionPrice),
  };
}

async function upsertPrice(modelId: string, price: ModelPrice) {
  await prisma.modelPricing.upsert({
    where: { modelId },
    create: {
      modelId,
      promptPrice: price.promptPrice,
      completionPrice: price.completionPrice,
    },
    update: {
      promptPrice: price.promptPrice,
      completionPrice: price.completionPrice,
      fetchedAt: new Date(),
    },
  });
}

async function refreshModelPrice(
  rawModelId: string,
  modelId: string,
): Promise<ResolvedModelPricing> {
  const fresh = await fetchSingleModel(modelId);
  if (fresh) {
    await upsertPrice(modelId, fresh);
    return {
      rawModelId,
      pricedModelId: modelId,
      pricingSource: "openrouter-refresh",
      ...fresh,
    };
  }

  const fromList = await fetchFromFullList(modelId);
  if (fromList) {
    const { modelId: matchedModelId, ...price } = fromList;
    await upsertPrice(matchedModelId, price);
    return {
      rawModelId,
      pricedModelId: matchedModelId,
      pricingSource: "openrouter-refresh",
      ...price,
    };
  }

  const stale = await getStaleCacheRow(modelId);
  if (stale) {
    console.warn(
      `[model-pricing] refresh failed for "${modelId}", serving stale cache`,
    );
    return {
      rawModelId,
      pricedModelId: modelId,
      pricingSource: "openrouter-cache",
      ...stale,
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

const inflight = new Map<string, Promise<ResolvedModelPricing>>();

export async function resolveModelPricing(
  modelId: string,
): Promise<ResolvedModelPricing> {
  const rawModelId = modelId.trim() || "unknown";
  const override = pricingOverrides[rawModelId];
  if (hasManualPrice(override)) {
    return {
      rawModelId,
      pricedModelId: override.openRouterModelId?.trim() || rawModelId,
      pricingSource: "manual-override",
      promptPrice: Number(override.promptPrice),
      completionPrice: Number(override.completionPrice),
    };
  }

  const key =
    override?.openRouterModelId?.trim() ||
    normalizeOpenRouterModelId(rawModelId);

  const row = await prisma.modelPricing.findUnique({ where: { modelId: key } });
  if (row && Date.now() - row.fetchedAt.getTime() < STALE_AFTER_MS) {
    return {
      rawModelId,
      pricedModelId: key,
      pricingSource: "openrouter-cache",
      promptPrice: Number(row.promptPrice),
      completionPrice: Number(row.completionPrice),
    };
  }

  const inflightKey = key;
  const existing = inflight.get(inflightKey);
  if (existing) {
    return existing;
  }

  const p = refreshModelPrice(rawModelId, key).finally(() => {
    inflight.delete(inflightKey);
  });
  inflight.set(inflightKey, p);
  return p;
}

/** Returns cached price if fresh, otherwise refreshes (with fallback chain). */
export async function getModelPricing(modelId: string): Promise<ModelPrice> {
  const { promptPrice, completionPrice } = await resolveModelPricing(modelId);
  return { promptPrice, completionPrice };
}

/** Warms/refreshes pricing for all seed models. Safe to call repeatedly. */
export async function refreshAllSeedModelPricing(): Promise<void> {
  await Promise.all(SEED_MODEL_IDS.map((id) => getModelPricing(id)));
}

let refreshInterval: ReturnType<typeof setInterval> | undefined;

/** Starts boot-time + 24h background pricing refresh. Call once at server startup. */
export function startModelPricingRefresh(): void {
  if (refreshInterval) {
    return;
  }
  refreshAllSeedModelPricing().catch((err) =>
    console.warn("[model-pricing] initial refresh failed", err),
  );
  refreshInterval = setInterval(() => {
    refreshAllSeedModelPricing().catch((err) =>
      console.warn("[model-pricing] scheduled refresh failed", err),
    );
  }, STALE_AFTER_MS);
  // Allow Node to exit in tests/scripts without waiting for the timer.
  if (typeof refreshInterval === "object" && "unref" in refreshInterval) {
    refreshInterval.unref();
  }
}

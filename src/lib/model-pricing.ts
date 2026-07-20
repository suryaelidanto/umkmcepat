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

const inflight = new Map<string, Promise<ModelPrice>>();

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

async function fetchFromFullList(modelId: string): Promise<ModelPrice | null> {
  try {
    const res = await fetchWithTimeout(`${OPENROUTER_API_BASE}/models`);
    if (!res.ok) {
      return null;
    }
    const body = await res.json();
    const match = (body?.data as unknown[] | undefined)?.find(
      (m) => (m as { id?: string })?.id === modelId,
    );
    return parsePricing(match);
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

async function refreshModelPrice(modelId: string): Promise<ModelPrice> {
  const fresh = await fetchSingleModel(modelId);
  if (fresh) {
    await upsertPrice(modelId, fresh);
    return fresh;
  }

  const fromList = await fetchFromFullList(modelId);
  if (fromList) {
    await upsertPrice(modelId, fromList);
    return fromList;
  }

  const stale = await getStaleCacheRow(modelId);
  if (stale) {
    console.warn(
      `[model-pricing] refresh failed for "${modelId}", serving stale cache`,
    );
    return stale;
  }

  console.warn(
    `[model-pricing] no price for "${modelId}" — using conservative floor`,
  );
  // Do not upsert floor as if it were real OpenRouter data.
  return CONSERVATIVE_DEFAULT_PRICE;
}

/** Returns cached price if fresh, otherwise refreshes (with fallback chain). */
export async function getModelPricing(modelId: string): Promise<ModelPrice> {
  const key = normalizeOpenRouterModelId(modelId || "unknown");

  const row = await prisma.modelPricing.findUnique({ where: { modelId: key } });
  if (row && Date.now() - row.fetchedAt.getTime() < STALE_AFTER_MS) {
    return {
      promptPrice: Number(row.promptPrice),
      completionPrice: Number(row.completionPrice),
    };
  }

  const existing = inflight.get(key);
  if (existing) {
    return existing;
  }

  const p = refreshModelPrice(key).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
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

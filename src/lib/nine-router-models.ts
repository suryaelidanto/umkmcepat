import { getEnv } from "@/lib/config";

const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;

let cache: { expiresAt: number; models: string[] } | null = null;

export function resetNineRouterModelsCacheForTests() {
  cache = null;
}

/**
 * 9Router combos only (not upstream provider models).
 * Combos appear in GET /v1/models with owned_by: "combo".
 */
export async function listNineRouterModels(): Promise<string[]> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.models;
  }

  const baseURL = getEnv("NINE_ROUTER_BASE_URL").replace(/\/+$/, "");
  const apiKey = getEnv("NINE_ROUTER_API_KEY");
  if (!baseURL || !apiKey) {
    return [];
  }

  const url = `${baseURL}/models`;
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return [];
    }
    const body = (await response.json()) as {
      data?: Array<{ id?: unknown; owned_by?: unknown }>;
    };
    const models = [
      ...new Set(
        (body.data ?? [])
          .filter((row) => row.owned_by === "combo")
          .map((row) => (typeof row.id === "string" ? row.id.trim() : ""))
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));

    cache = { models, expiresAt: Date.now() + CACHE_TTL_MS };
    return models;
  } catch {
    return [];
  }
}

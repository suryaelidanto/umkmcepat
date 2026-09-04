type RuntimeCacheEntry = {
  body: unknown;
  expiresAt: number;
  projectId: string;
  userId: string;
};

const runtimeStateCache = new Map<string, RuntimeCacheEntry>();
export const RUNTIME_STATE_CACHE_TTL_MS = 15_000;
export const RUNTIME_STATE_CACHE_MAX_ENTRIES = 200;

function runtimeStateCacheKey(userId: string, projectId: string) {
  return `${userId.length}:${userId}${projectId}`;
}

function evictExpiredRuntimeStateCache() {
  const now = Date.now();

  for (const [key, entry] of runtimeStateCache) {
    if (entry.expiresAt <= now) {
      runtimeStateCache.delete(key);
    }
  }
}

function createCacheSafeRuntimeBody(body: unknown) {
  return JSON.parse(
    JSON.stringify(body, (key, value) =>
      key === "logText" ? undefined : value,
    ),
  ) as unknown;
}

export function readRuntimeStateCache(userId: string, projectId: string) {
  evictExpiredRuntimeStateCache();
  const cached = runtimeStateCache.get(runtimeStateCacheKey(userId, projectId));

  if (
    !cached ||
    cached.userId !== userId ||
    cached.projectId !== projectId ||
    cached.expiresAt <= Date.now()
  ) {
    return null;
  }

  return cached;
}

export function writeRuntimeStateCache(
  userId: string,
  projectId: string,
  body: unknown,
) {
  evictExpiredRuntimeStateCache();
  const key = runtimeStateCacheKey(userId, projectId);

  runtimeStateCache.delete(key);

  while (runtimeStateCache.size >= RUNTIME_STATE_CACHE_MAX_ENTRIES) {
    const oldestKey = runtimeStateCache.keys().next().value;

    if (typeof oldestKey !== "string") {
      break;
    }

    runtimeStateCache.delete(oldestKey);
  }

  runtimeStateCache.set(key, {
    body: createCacheSafeRuntimeBody(body),
    expiresAt: Date.now() + RUNTIME_STATE_CACHE_TTL_MS,
    projectId,
    userId,
  });
}

export function invalidateProjectRuntimeStateCache(projectId: string) {
  for (const [key, entry] of runtimeStateCache) {
    if (entry.projectId === projectId) {
      runtimeStateCache.delete(key);
    }
  }
}

export function clearRuntimeStateCache() {
  runtimeStateCache.clear();
}

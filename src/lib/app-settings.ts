import { findConfigEntry, type SettingType } from "./app-settings-registry";

import type { PrismaClient } from "@prisma/client";

type CacheEntry = { value: unknown; expiresAt: number };
const TTL_MS = 5_000;
const cache = new Map<string, CacheEntry>();

// ponytail: prisma is imported lazily inside getSetting so this module's
// evaluation stays browser-safe. app-settings is imported by client-reachable
// modules (pakasir → EnergyBoosterModal; config → ai-timeouts → WorkspacePrimitives);
// a static `import { prisma } from "@/lib/prisma"` would drag the Node-only
// `global` reference into the browser bundle and break Storybook. The prisma
// singleton is only needed for the async DB read. When a sync client-side read
// of DB config is needed, add a client-safe resolver instead of widening this.
async function getDb(): Promise<PrismaClient["appSetting"]> {
  const { prisma } = await import("@/lib/prisma");
  return prisma.appSetting;
}

export function invalidateSettingCache(key?: string): void {
  if (key) {
    cache.delete(key);
    return;
  }
  cache.clear();
}

function envKeyFor(settingKey: string): string | null {
  // feature.waitlist_enabled → WAITLIST_ENABLED (special case: env predates DB config)
  if (settingKey === "feature.waitlist_enabled") {
    return "WAITLIST_ENABLED";
  }
  if (settingKey === "feature.generated_build_execution") {
    return "GENERATED_BUILD_EXECUTION_ENABLED";
  }
  if (settingKey === "feature.generated_public_execution") {
    return "GENERATED_PUBLIC_EXECUTION_ENABLED";
  }
  // ratelimit.global_ip.requests → RATE_LIMIT_GLOBAL_IP_REQUESTS
  if (settingKey.startsWith("ratelimit.")) {
    return settingKey
      .replace("ratelimit.", "RATE_LIMIT_")
      .replace(".", "_")
      .toUpperCase();
  }
  // booster.* and ai.* have no env equivalent (hardcoded only)
  return null;
}

function parseEnvValue(
  raw: string,
  type: SettingType,
): boolean | number | string | null {
  if (type === "boolean") {
    const lower = raw.trim().toLowerCase();
    if (lower === "true") {
      return true;
    }
    if (lower === "false") {
      return false;
    }
    return null; // invalid → fall through
  }
  if (type === "number") {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      return null;
    }
    return n;
  }
  return raw;
}

function coerce(
  value: unknown,
  type: SettingType,
): boolean | number | string | null {
  if (type === "boolean") {
    return typeof value === "boolean" ? value : null;
  }
  if (type === "number") {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return typeof value === "string" ? value : null;
}

export async function getSetting<T extends boolean | number | string>(
  key: string,
  fallback: T,
): Promise<T> {
  const entry = findConfigEntry(key);
  const type = entry?.type ?? typeof fallback;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return (coerce(cached.value, type as SettingType) as T) ?? fallback;
  }
  // DB-first
  try {
    const appSetting = await getDb();
    const row = await appSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    if (row) {
      const dbValue = coerce(row.value, type as SettingType);
      if (dbValue !== null) {
        cache.set(key, { value: dbValue, expiresAt: Date.now() + TTL_MS });
        return dbValue as T;
      }
    }
  } catch {
    // DB error → degrade to env/fallback. Never let a config read crash the app.
  }
  // env fallback
  const envName = envKeyFor(key);
  if (envName) {
    const raw = process.env[envName];
    if (raw) {
      const parsed = parseEnvValue(raw, type as SettingType);
      if (parsed !== null) {
        cache.set(key, { value: parsed, expiresAt: Date.now() + TTL_MS });
        return parsed as T;
      }
    }
  }
  return fallback;
}

// Cache-only read for sync call-sites (module scope, capability checks that
// can't await). Returns fallback when cache cold — DB overrides apply within
// TTL of the next async read. ponytail: ceiling = sync call-sites read stale
// until primed; upgrade path = prime the cache at server boot.
export function getSettingSync<T extends boolean | number | string>(
  key: string,
  fallback: T,
): T {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    const entry = findConfigEntry(key);
    const type = entry?.type ?? typeof fallback;
    return (coerce(cached.value, type as SettingType) as T) ?? fallback;
  }
  return fallback;
}

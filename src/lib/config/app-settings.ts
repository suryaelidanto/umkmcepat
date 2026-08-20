import { findConfigEntry, type SettingType } from "./app-settings-registry";

import type { PrismaClient } from "@prisma/client";

type CacheEntry = { value: unknown; expiresAt: number };
const TTL_MS = 5_000;
const cache = new Map<string, CacheEntry>();

// ponytail: prisma is imported lazily inside getSetting so this module's
async function getDb(): Promise<PrismaClient["appSetting"]> {
  const { prisma } = await import("@/lib/prisma");
  return prisma.appSetting;
}

// No-TTL snapshot of every AppSetting row, replaced wholesale by
let snapshot = new Map<string, unknown>();
let primePromise: Promise<void> | null = null;

export function invalidateSettingCache(key?: string): void {
  if (key) {
    cache.delete(key);
    snapshot.delete(key);
    return;
  }
  cache.clear();
  snapshot.clear();
  primePromise = null;
}

export function primeSettingCache(
  opts: { force?: boolean } = {},
): Promise<void> {
  if (opts.force) {
    primePromise = null;
  }
  primePromise ??= (async () => {
    try {
      const appSetting = await getDb();
      const rows = await appSetting.findMany({
        select: { key: true, value: true },
      });
      const next = new Map<string, unknown>();
      for (const row of rows) {
        const entry = findConfigEntry(row.key);
        if (!entry) {
          continue;
        }
        const value = coerce(row.value, entry.type);
        if (value !== null) {
          next.set(row.key, value);
        }
      }
      snapshot = next;
    } catch {
      // Never let a config read take the app down. Leaves the previous
    }
  })();
  return primePromise;
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
  if (snapshot.has(key)) {
    const snapValue = coerce(snapshot.get(key), type as SettingType);
    if (snapValue !== null) {
      return snapValue as T;
    }
  }
  // env fallback
  const envName = entry?.env;
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
export function getSettingSync<T extends boolean | number | string>(
  key: string,
  fallback: T,
): T {
  const entry = findConfigEntry(key);
  const type = (entry?.type ?? typeof fallback) as SettingType;

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return (coerce(cached.value, type) as T) ?? fallback;
  }
  if (snapshot.has(key)) {
    return (coerce(snapshot.get(key), type) as T) ?? fallback;
  }
  return fallback;
}

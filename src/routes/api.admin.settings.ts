import { Prisma } from "@prisma/client";
import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth/auth-admin";
import {
  invalidateSettingCache,
  primeSettingCache,
} from "@/lib/config/app-settings";
import {
  APP_SETTINGS,
  findConfigEntry,
  type ConfigEntry,
  type SettingCategory,
} from "@/lib/config/app-settings-registry";
import { prisma } from "@/lib/prisma";

// Returns an error message, or null when the value is acceptable.
export function validateSettingValue(
  key: string,
  value: unknown,
  category: SettingCategory,
): string | null {
  const entry = findConfigEntry(key);
  if (!entry || entry.category !== category) {
    return `Invalid key: ${key}`;
  }
  if (entry.type === "boolean" && typeof value !== "boolean") {
    return `${key} must be a boolean.`;
  }
  if (entry.type === "string" && typeof value !== "string") {
    return `${key} must be a string.`;
  }
  if (entry.type === "string" && entry.enumOptions) {
    if (!entry.enumOptions.includes(value as string)) {
      return `${key} must be one of: ${entry.enumOptions.join(", ")}.`;
    }
  }
  if (entry.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return `${key} must be a number.`;
    }
    const { min, max } = entry;
    if (
      (min !== undefined && value < min) ||
      (max !== undefined && value > max)
    ) {
      return `${key} must be between ${min} and ${max}.`;
    }
  }
  return null;
}

export const Route = createFileRoute("/api/admin/settings")({
  server: {
    handlers: {
      GET: async () => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }
        const rows = await prisma.appSetting.findMany({
          select: { category: true, key: true, value: true },
        });
        const dbMap = new Map(rows.map((r) => [r.key, r.value]));
        const envValue = (entry: ConfigEntry): unknown => {
          if (!entry.env) {
            return undefined;
          }
          const raw = process.env[entry.env];
          if (!raw) {
            return undefined;
          }
          return entry.type === "boolean" ? raw.toLowerCase() : raw;
        };
        const entries = APP_SETTINGS.map((e) => {
          const db = dbMap.get(e.key);
          const env = envValue(e);
          const source =
            db !== undefined ? "db" : env !== undefined ? "env" : "fallback";
          return {
            category: e.category,
            dbValue: db ?? null,
            display: e.display ?? null,
            effectiveValue: db ?? env ?? e.fallback,
            env: e.env ?? null,
            fallback: e.fallback,
            key: e.key,
            label: e.label,
            max: e.max ?? null,
            min: e.min ?? null,
            optionsSource: e.optionsSource ?? null,
            enumOptions: e.enumOptions ? [...e.enumOptions] : null,
            requiresRestart: e.requiresRestart ?? false,
            source,
            tier: e.tier,
            type: e.type,
          };
        });
        return Response.json({ entries });
      },

      PUT: async ({ request }) => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }
        const body = (await request.json().catch(() => ({}))) as {
          category?: string;
          values?: Record<string, unknown>;
        };
        const category = body.category as SettingCategory | undefined;
        const values = body.values ?? {};
        if (!category || !values) {
          return Response.json(
            { message: "category dan values wajib diisi." },
            { status: 400 },
          );
        }
        // Validate every value against the registry.
        for (const [key, value] of Object.entries(values)) {
          const error = validateSettingValue(key, value, category);
          if (error) {
            return Response.json({ message: error }, { status: 400 });
          }
        }
        await prisma.$transaction(
          Object.entries(values).map(([key, value]) =>
            prisma.appSetting.upsert({
              where: { key },
              create: {
                category,
                key,
                value: value as Prisma.InputJsonValue,
                updatedBy: admin.admin.email,
              },
              update: {
                value: value as Prisma.InputJsonValue,
                updatedBy: admin.admin.email,
              },
            }),
          ),
        );
        invalidateSettingCache();
        await primeSettingCache();
        const { refreshAttemptWorkerConcurrency } =
          await import("@/lib/projects/attempt-queue");
        refreshAttemptWorkerConcurrency();
        return Response.json({ ok: true });
      },
    },
  },
});

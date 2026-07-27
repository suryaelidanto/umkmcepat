import { Prisma } from "@prisma/client";
import { createFileRoute } from "@tanstack/react-router";

import { invalidateSettingCache } from "@/lib/app-settings";
import {
  APP_SETTINGS,
  findConfigEntry,
  type SettingCategory,
} from "@/lib/app-settings-registry";
import { requireAdmin } from "@/lib/auth-admin";
import { prisma } from "@/lib/prisma";

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
        const envValue = (key: string): unknown => {
          const envNames: Record<string, string> = {
            "feature.waitlist_enabled": "WAITLIST_ENABLED",
            "feature.generated_build_execution":
              "GENERATED_BUILD_EXECUTION_ENABLED",
            "feature.generated_public_execution":
              "GENERATED_PUBLIC_EXECUTION_ENABLED",
          };
          const name = envNames[key];
          if (!name) {
            return undefined;
          }
          const raw = process.env[name];
          if (!raw) {
            return undefined;
          }
          return raw.toLowerCase();
        };
        const entries = APP_SETTINGS.map((e) => {
          const db = dbMap.get(e.key);
          const env = envValue(e.key);
          const source =
            db !== undefined ? "db" : env !== undefined ? "env" : "fallback";
          return {
            category: e.category,
            dbValue: db ?? null,
            effectiveValue: db ?? env ?? e.fallback,
            fallback: e.fallback,
            key: e.key,
            label: e.label,
            source,
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
          const entry = findConfigEntry(key);
          if (!entry || entry.category !== category) {
            return Response.json(
              { message: `Kunci tidak valid: ${key}` },
              { status: 400 },
            );
          }
          if (entry.type === "boolean" && typeof value !== "boolean") {
            return Response.json(
              { message: `${key} harus boolean.` },
              { status: 400 },
            );
          }
          if (
            entry.type === "number" &&
            (typeof value !== "number" || !Number.isFinite(value))
          ) {
            return Response.json(
              { message: `${key} harus angka.` },
              { status: 400 },
            );
          }
          if (entry.type === "string" && typeof value !== "string") {
            return Response.json(
              { message: `${key} harus string.` },
              { status: 400 },
            );
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
        return Response.json({ ok: true });
      },
    },
  },
});

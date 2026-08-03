import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
  getDirtyKeys,
  groupByTier,
  type SettingEntry,
} from "./-_main.admin.settings.helpers";

import type { CategoryGroup } from "./-_main.admin.settings.helpers";

import { AdvancedSettingsDisclosure } from "@/components/admin/AdvancedSettingsDisclosure";
import { settingsSaveInvalidateKeys } from "@/lib/admin-settings-sync";
import { fetchJson } from "@/lib/query-client";

export const Route = createFileRoute("/_main/admin/settings")({
  component: SettingsPage,
});

/** id-ID thousands: 1000000 → "1.000.000" */
function formatGroupedNumber(value: unknown): string {
  if (value === "" || value === null || value === undefined) {
    return "";
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return "";
  }
  return Math.trunc(n).toLocaleString("id-ID");
}

/** Strip non-digits; empty → "" for draft, else number. */
function parseGroupedNumber(raw: string): number | "" {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") {
    return "";
  }
  return Number(digits);
}

function CategorySection({
  group,
  draft,
  isPending,
  setDraft,
  onSave,
}: {
  group: CategoryGroup;
  draft: Record<string, unknown>;
  isPending: boolean;
  setDraft: (d: Record<string, unknown>) => void;
  onSave: (category: string, values: Record<string, unknown>) => void;
}) {
  const dirty = getDirtyKeys(group.entries, draft);
  const hasDirty = dirty.size > 0;

  return (
    <section>
      <h2 className="mb-spacing-3 text-lg font-semibold capitalize">
        {group.category.replace("_", " ")}
      </h2>
      <div className="flex flex-col gap-spacing-3">
        {group.entries.map((entry) => {
          const value = draft[entry.key] ?? entry.effectiveValue;
          return (
            <div
              className="flex items-center justify-between gap-spacing-3 rounded-radius-md border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-3 text-sm"
              key={entry.key}
            >
              <div>
                <p>
                  {entry.label}
                  {entry.requiresRestart ? (
                    <span className="ml-spacing-2 rounded-radius-sm bg-surface-warm-white/15 px-spacing-2 py-spacing-1 text-xs text-surface-warm-white/80">
                      perlu restart
                    </span>
                  ) : null}
                </p>
                <p className="text-surface-warm-white/70">
                  Sumber: {entry.source} · fallback: {String(entry.fallback)}
                </p>
              </div>
              {entry.type === "boolean" ? (
                <button
                  className={
                    value === true
                      ? "rounded-radius-md bg-emerald-600 px-spacing-3 py-spacing-2 text-white"
                      : "rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm text-surface-warm-white"
                  }
                  onClick={() => setDraft({ ...draft, [entry.key]: !value })}
                  type="button"
                >
                  {value === true ? "ON" : "OFF"}
                </button>
              ) : entry.type === "number" ? (
                <input
                  className="w-36 rounded-radius-md border border-surface-warm-white/15 bg-surface-warm-white/5 px-spacing-2 py-spacing-1 text-sm tabular-nums text-surface-warm-white"
                  inputMode="numeric"
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [entry.key]: parseGroupedNumber(e.target.value),
                    })
                  }
                  type="text"
                  value={formatGroupedNumber(value)}
                />
              ) : (
                <input
                  className="w-32 rounded-radius-md border border-surface-warm-white/15 bg-surface-warm-white/5 px-spacing-2 py-spacing-1 text-sm text-surface-warm-white"
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [entry.key]: e.target.value,
                    })
                  }
                  type="text"
                  value={String(value)}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-spacing-3 flex items-center gap-spacing-2">
        <button
          className="rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm text-surface-warm-white/80 hover:bg-surface-warm-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasDirty}
          onClick={() => {
            const next = { ...draft };
            for (const key of dirty) {
              delete next[key];
            }
            setDraft(next);
          }}
          type="button"
        >
          Reset
        </button>
        <button
          className="rounded-radius-md bg-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm text-surface-warm-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasDirty || isPending}
          onClick={() => {
            const values: Record<string, unknown> = {};
            for (const key of dirty) {
              values[key] = draft[key];
            }
            onSave(group.category, values);
          }}
          type="button"
        >
          {hasDirty
            ? `Simpan ${group.category.replace("_", " ")} (${dirty.size})`
            : `Simpan ${group.category.replace("_", " ")}`}
        </button>
      </div>
    </section>
  );
}

function SettingsPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryFn: () =>
      fetchJson<{ entries: SettingEntry[] }>("/api/admin/settings"),
    queryKey: ["admin", "settings"],
  });
  const [baseline, setBaseline] = useState<SettingEntry[]>([]);
  const [draft, setDraft] = useState<Record<string, unknown>>({});

  const entries = data?.entries ?? [];
  const dirtyKeys = new Set(Object.keys(draft));
  if (data && baseline !== entries && dirtyKeys.size === 0) {
    setBaseline(entries);
  }

  const save = useMutation({
    mutationFn: (vars: { category: string; values: Record<string, unknown> }) =>
      fetchJson("/api/admin/settings", {
        body: JSON.stringify(vars),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      }),
    onSuccess: async () => {
      await Promise.all(
        settingsSaveInvalidateKeys().map((queryKey) =>
          queryClient.invalidateQueries({ queryKey: [...queryKey] }),
        ),
      );
      setDraft({});
      toast.success("Pengaturan disimpan.");
    },
    onError: () => toast.error("Gagal menyimpan."),
  });

  const groups = groupByTier(entries);
  const advancedCount = groups.advanced.reduce(
    (sum, g) => sum + g.entries.length,
    0,
  );

  return (
    <div className="flex flex-col gap-spacing-6">
      {groups.basic.map((group) => (
        <CategorySection
          draft={draft}
          group={group}
          isPending={save.isPending}
          key={group.category}
          onSave={(category, values) => save.mutate({ category, values })}
          setDraft={setDraft}
        />
      ))}
      {advancedCount > 0 ? (
        <AdvancedSettingsDisclosure count={advancedCount}>
          {groups.advanced.map((group) => (
            <CategorySection
              draft={draft}
              group={group}
              isPending={save.isPending}
              key={group.category}
              onSave={(category, values) => save.mutate({ category, values })}
              setDraft={setDraft}
            />
          ))}
        </AdvancedSettingsDisclosure>
      ) : null}
    </div>
  );
}

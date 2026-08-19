import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
  fromDisplayNumber,
  getDirtyKeys,
  groupByTier,
  toDisplayNumber,
  type SettingEntry,
} from "./-_main.admin.settings.helpers";

import type { CategoryGroup } from "./-_main.admin.settings.helpers";

import { AdvancedSettingsDisclosure } from "@/components/admin/AdvancedSettingsDisclosure";
import { settingsSaveInvalidateKeys } from "@/lib/admin/admin-settings-sync";
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

function modelSelectOptions(
  value: unknown,
  modelIds: string[],
  defaultModelId: string,
): string[] {
  const current = String(value ?? "").trim();
  const fallback = defaultModelId.trim() || "default-combo";
  const ids = [...modelIds];
  for (const id of [current, fallback, "default-combo"]) {
    if (id && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

function modelSelectValue(value: unknown, defaultModelId: string): string {
  const current = String(value ?? "").trim();
  if (current) {
    return current;
  }
  return defaultModelId.trim() || "default-combo";
}

const CATEGORY_TITLES: Record<string, string> = {
  feature_flag: "Fitur & Mode",
  economics: "Ekonomi & Kuota",
  booster: "Paket Booster Energi",
  ai: "Model AI & Timeout",
  rate_limit: "Batas Laju (Rate Limit)",
  runtime: "Runtime & Build",
  limits: "Batas Ukuran File",
};

function CategorySection({
  group,
  draft,
  isPending,
  modelIds,
  modelsLoadFailed,
  defaultModelId,
  setDraft,
  onSave,
}: {
  group: CategoryGroup;
  draft: Record<string, unknown>;
  isPending: boolean;
  modelIds: string[];
  modelsLoadFailed: boolean;
  defaultModelId: string;
  setDraft: (d: Record<string, unknown>) => void;
  onSave: (category: string, values: Record<string, unknown>) => void;
}) {
  const dirty = getDirtyKeys(group.entries, draft);
  const hasDirty = dirty.size > 0;
  const title =
    CATEGORY_TITLES[group.category] || group.category.replace("_", " ");

  return (
    <section className="rounded-2xl border border-black/10 bg-[#fcfbf8] p-spacing-6 shadow-xs transition-colors dark:border-white/10 dark:bg-[#191917] sm:p-spacing-7">
      <div className="mb-spacing-4 flex items-center justify-between border-b border-black/10 pb-spacing-3 dark:border-white/10">
        <div>
          <h2 className="text-base font-bold tracking-tight text-[#1c1c1c] dark:text-surface-warm-white">
            {title}
          </h2>
          <p className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/60">
            {group.entries.length} pengaturan
          </p>
        </div>
      </div>
      <div className="divide-y divide-black/10 dark:divide-white/10">
        {group.entries.map((entry) => {
          const value = draft[entry.key] ?? entry.effectiveValue;
          return (
            <div
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-spacing-3 py-4 first:pt-0 last:pb-0 text-sm text-[#1c1c1c] dark:text-surface-warm-white"
              key={entry.key}
            >
              <div className="min-w-0 flex-1 pr-4">
                <p className="font-medium text-[#1c1c1c] dark:text-surface-warm-white">
                  {entry.label}
                  {entry.requiresRestart ? (
                    <span className="ml-spacing-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                      perlu restart
                    </span>
                  ) : null}
                </p>
                <p className="text-[11px] text-[#5f5f5d] dark:text-surface-warm-white/50">
                  Key: <code className="font-mono">{entry.key}</code> ·
                  fallback: {String(entry.fallback)}
                </p>
              </div>
              {entry.type === "boolean" ? (
                <button
                  className={
                    value === true
                      ? "rounded-lg bg-emerald-600 px-4 py-1.5 font-semibold text-xs text-white hover:bg-emerald-500 transition"
                      : "rounded-lg border border-black/15 bg-white px-4 py-1.5 text-xs font-semibold text-[#1c1c1c] hover:bg-black/[0.04] transition dark:border-white/15 dark:bg-white/[0.05] dark:text-surface-warm-white dark:hover:bg-white/[0.08]"
                  }
                  onClick={() => setDraft({ ...draft, [entry.key]: !value })}
                  type="button"
                >
                  {value === true ? "ON" : "OFF"}
                </button>
              ) : entry.type === "number" ? (
                <div className="flex items-center gap-spacing-2">
                  <input
                    className="w-36 rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm tabular-nums text-[#1c1c1c] outline-none focus:border-accent-orange focus:ring-1 focus:ring-accent-orange dark:border-white/15 dark:bg-white/[0.05] dark:text-surface-warm-white"
                    inputMode="numeric"
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        [entry.key]: fromDisplayNumber(
                          entry,
                          parseGroupedNumber(e.target.value),
                        ),
                      })
                    }
                    type="text"
                    value={formatGroupedNumber(toDisplayNumber(entry, value))}
                  />
                  {entry.display === "percentage" ? (
                    <span className="text-[#5f5f5d] dark:text-surface-warm-white/70">
                      %
                    </span>
                  ) : null}
                </div>
              ) : entry.optionsSource === "nine_router_models" ? (
                <div className="flex flex-col items-end gap-spacing-1">
                  <select
                    className="max-w-xs rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm text-[#1c1c1c] outline-none focus:border-accent-orange focus:ring-1 focus:ring-accent-orange dark:border-white/15 dark:bg-white/[0.05] dark:text-[#fafafa]"
                    disabled={isPending}
                    onChange={(e) =>
                      setDraft({ ...draft, [entry.key]: e.target.value })
                    }
                    value={modelSelectValue(value, defaultModelId)}
                  >
                    {modelSelectOptions(value, modelIds, defaultModelId).map(
                      (id) => (
                        <option
                          key={id}
                          className="bg-white text-[#1c1c1c] dark:bg-[#18181b] dark:text-[#fafafa]"
                          value={id}
                        >
                          {id === defaultModelId ? `${id} (default)` : id}
                        </option>
                      ),
                    )}
                  </select>
                  {modelSelectValue(value, defaultModelId) &&
                  modelIds.length > 0 &&
                  !modelIds.includes(
                    modelSelectValue(value, defaultModelId),
                  ) ? (
                    <p className="text-xs text-amber-600 dark:text-amber-200/90">
                      Tidak ada di daftar combo 9Router
                    </p>
                  ) : null}
                  {modelsLoadFailed || modelIds.length === 0 ? (
                    <p className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/60">
                      Daftar combo 9Router kosong / gagal dimuat
                    </p>
                  ) : null}
                </div>
              ) : entry.enumOptions && entry.enumOptions.length ? (
                <select
                  className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm text-[#1c1c1c] outline-none focus:border-accent-orange focus:ring-1 focus:ring-accent-orange dark:border-white/15 dark:bg-white/[0.05] dark:text-surface-warm-white"
                  disabled={isPending}
                  onChange={(e) =>
                    setDraft({ ...draft, [entry.key]: e.target.value })
                  }
                  value={String(value)}
                >
                  {entry.enumOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : entry.key.endsWith(".desc") ? (
                <textarea
                  rows={2}
                  className="w-64 sm:w-80 md:w-96 rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm text-[#1c1c1c] resize-y outline-none focus:border-accent-orange focus:ring-1 focus:ring-accent-orange dark:border-white/15 dark:bg-white/[0.05] dark:text-surface-warm-white"
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [entry.key]: e.target.value,
                    })
                  }
                  value={String(value)}
                />
              ) : (
                <input
                  className="w-48 sm:w-64 md:w-80 rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm text-[#1c1c1c] outline-none focus:border-accent-orange focus:ring-1 focus:ring-accent-orange dark:border-white/15 dark:bg-white/[0.05] dark:text-surface-warm-white"
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
      <div className="mt-spacing-6 flex items-center justify-between border-t border-black/10 pt-spacing-4 dark:border-white/10">
        <span className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/50">
          {hasDirty
            ? `${dirty.size} perubahan belum disimpan`
            : "Semua tersimpan"}
        </span>
        <div className="flex items-center gap-spacing-3">
          <button
            className="rounded-lg border border-black/15 px-4 py-2 text-xs font-semibold text-[#5f5f5d] hover:bg-black/5 hover:text-[#1c1c1c] disabled:cursor-not-allowed disabled:opacity-40 transition dark:border-white/15 dark:text-surface-warm-white/70 dark:hover:bg-white/10 dark:hover:text-surface-warm-white"
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
            Batal
          </button>
          <button
            className="rounded-lg bg-[#1c1c1c] px-5 py-2 text-xs font-bold text-white transition hover:bg-black active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-surface-warm-white dark:text-[#141413] dark:hover:bg-white"
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
            {hasDirty ? `Simpan (${dirty.size})` : "Simpan"}
          </button>
        </div>
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
  const modelsQuery = useQuery({
    queryFn: () => fetchJson<{ models: string[] }>("/api/admin/ai-models"),
    queryKey: ["admin", "ai-models"],
    staleTime: 60_000,
  });
  const modelIds = modelsQuery.data?.models ?? [];
  const modelsLoadFailed = modelsQuery.isError;
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
  const defaultModelEntry = entries.find((e) => e.key === "ai.models_default");
  const defaultModelId = modelSelectValue(
    draft["ai.models_default"] ?? defaultModelEntry?.effectiveValue,
    "default-combo",
  );

  return (
    <div className="flex flex-col gap-spacing-6">
      {groups.basic.map((group) => (
        <CategorySection
          defaultModelId={defaultModelId}
          draft={draft}
          group={group}
          isPending={save.isPending}
          key={group.category}
          modelIds={modelIds}
          modelsLoadFailed={modelsLoadFailed}
          onSave={(category, values) => save.mutate({ category, values })}
          setDraft={setDraft}
        />
      ))}
      {advancedCount > 0 ? (
        <AdvancedSettingsDisclosure count={advancedCount}>
          {groups.advanced.map((group) => (
            <CategorySection
              defaultModelId={defaultModelId}
              draft={draft}
              group={group}
              isPending={save.isPending}
              key={group.category}
              modelIds={modelIds}
              modelsLoadFailed={modelsLoadFailed}
              onSave={(category, values) => save.mutate({ category, values })}
              setDraft={setDraft}
            />
          ))}
        </AdvancedSettingsDisclosure>
      ) : null}
    </div>
  );
}

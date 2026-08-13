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
                <div className="flex items-center gap-spacing-2">
                  <input
                    className="w-36 rounded-radius-md border border-surface-warm-white/15 bg-surface-warm-white/5 px-spacing-2 py-spacing-1 text-sm tabular-nums text-surface-warm-white"
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
                    <span className="text-surface-warm-white/70">%</span>
                  ) : null}
                </div>
              ) : entry.optionsSource === "nine_router_models" ? (
                <div className="flex flex-col items-end gap-spacing-1">
                  <select
                    className="max-w-xs rounded-radius-md border border-surface-warm-white/15 px-spacing-2 py-spacing-1 text-sm"
                    disabled={isPending}
                    onChange={(e) =>
                      setDraft({ ...draft, [entry.key]: e.target.value })
                    }
                    style={{
                      backgroundColor: "#18181b",
                      color: "#fafafa",
                    }}
                    value={modelSelectValue(value, defaultModelId)}
                  >
                    {modelSelectOptions(value, modelIds, defaultModelId).map(
                      (id) => (
                        <option
                          key={id}
                          style={{
                            backgroundColor: "#ffffff",
                            color: "#18181b",
                          }}
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
                    <p className="text-xs text-amber-200/90">
                      Tidak ada di daftar combo 9Router
                    </p>
                  ) : null}
                  {modelsLoadFailed || modelIds.length === 0 ? (
                    <p className="text-xs text-surface-warm-white/60">
                      Daftar combo 9Router kosong / gagal dimuat
                    </p>
                  ) : null}
                </div>
              ) : entry.enumOptions && entry.enumOptions.length ? (
                <select
                  className="rounded-radius-md border border-surface-warm-white/15 bg-surface-warm-white/5 px-spacing-2 py-spacing-1 text-sm text-surface-warm-white"
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

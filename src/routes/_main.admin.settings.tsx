import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
  getDirtyKeys,
  isDirtyEntry,
  type SettingEntry,
} from "./_main.admin.settings.helpers";

import { fetchJson } from "@/lib/query-client";

export const Route = createFileRoute("/_main/admin/settings")({
  component: SettingsPage,
});

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      setDraft({});
      toast.success("Pengaturan disimpan.");
    },
    onError: () => toast.error("Gagal menyimpan."),
  });

  const categories = ["feature_flag", "booster", "rate_limit", "ai"] as const;
  const byCat = (cat: string) =>
    entries.filter((e) => e.category === cat) ?? [];
  const dirtyByCategory = (cat: string): Set<string> =>
    getDirtyKeys(
      entries.filter((e) => e.category === cat),
      draft,
    );

  return (
    <div className="flex flex-col gap-spacing-6">
      {categories.map((cat) => (
        <section key={cat}>
          <h2 className="mb-spacing-3 text-lg font-semibold capitalize">
            {cat.replace("_", " ")}
          </h2>
          <div className="flex flex-col gap-spacing-3">
            {byCat(cat).map((entry) => {
              const value = draft[entry.key] ?? entry.effectiveValue;
              return (
                <div
                  className="flex items-center justify-between gap-spacing-3 rounded-radius-md border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-3 text-sm"
                  key={entry.key}
                >
                  <div>
                    <p>{entry.label}</p>
                    <p className="text-surface-warm-white/70">
                      Sumber: {entry.source} · fallback:{" "}
                      {String(entry.fallback)}
                    </p>
                  </div>
                  {entry.type === "boolean" ? (
                    <button
                      className={
                        value === true
                          ? "rounded-radius-md bg-emerald-600 px-spacing-3 py-spacing-2 text-white"
                          : "rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm text-surface-warm-white"
                      }
                      onClick={() =>
                        setDraft((d) => ({ ...d, [entry.key]: !value }))
                      }
                      type="button"
                    >
                      {value === true ? "ON" : "OFF"}
                    </button>
                  ) : (
                    <input
                      className="w-32 rounded-radius-md border border-surface-warm-white/15 bg-surface-warm-white/5 px-spacing-2 py-spacing-1 text-sm text-surface-warm-white"
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          [entry.key]:
                            entry.type === "number"
                              ? Number(e.target.value)
                              : e.target.value,
                        }))
                      }
                      type={entry.type === "number" ? "number" : "text"}
                      value={String(value)}
                    />
                  )}
                  {isDirtyEntry(entry, draft[entry.key]) && (
                    <button
                      className="rounded-radius-md border border-surface-warm-white/15 px-spacing-2 py-spacing-1 text-xs text-surface-warm-white/80 hover:bg-surface-warm-white/10"
                      onClick={() =>
                        setDraft((d) => {
                          const next = { ...d };
                          delete next[entry.key];
                          return next;
                        })
                      }
                      type="button"
                    >
                      Reset
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {(() => {
            const dirty = dirtyByCategory(cat);
            const hasDirty = dirty.size > 0;
            return (
              <button
                className="mt-spacing-3 rounded-radius-md bg-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm text-surface-warm-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!hasDirty || save.isPending}
                onClick={() => {
                  const values: Record<string, unknown> = {};
                  for (const key of dirty) {
                    values[key] = draft[key];
                  }
                  save.mutate({ category: cat, values });
                }}
                type="button"
              >
                {hasDirty
                  ? `Simpan ${cat.replace("_", " ")} (${dirty.size})`
                  : `Simpan ${cat.replace("_", " ")}`}
              </button>
            );
          })()}
        </section>
      ))}
    </div>
  );
}

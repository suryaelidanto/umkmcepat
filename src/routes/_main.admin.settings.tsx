import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { fetchJson } from "@/lib/query-client";

type SettingEntry = {
  category: string;
  dbValue: unknown;
  effectiveValue: unknown;
  fallback: boolean | number | string;
  key: string;
  label: string;
  source: string;
  type: "boolean" | "number" | "string";
};

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
  const [draft, setDraft] = useState<Record<string, unknown>>({});

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
    data?.entries.filter((e) => e.category === cat) ?? [];

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
                </div>
              );
            })}
          </div>
          <button
            className="mt-spacing-3 rounded-radius-md bg-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm text-surface-warm-white"
            onClick={() => save.mutate({ category: cat, values: draft })}
            type="button"
          >
            Simpan {cat.replace("_", " ")}
          </button>
        </section>
      ))}
    </div>
  );
}

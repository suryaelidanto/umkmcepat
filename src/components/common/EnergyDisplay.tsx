"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useSession } from "@/lib/auth-client";
import { fetchJson, notifyEnergyChanged, queryKeys } from "@/lib/query-client";

type EnergyStats = {
  remaining: number;
  used: number;
  limit: number;
  resetsAt: string;
  inputTokens: number;
  outputTokens: number;
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

export function EnergyDisplay() {
  const queryClient = useQueryClient();
  const { data: session, status } = useSession();
  const hasUser = Boolean(session?.user) && status !== "loading";
  const energyQuery = useQuery({
    queryKey: queryKeys.energy,
    queryFn: () =>
      fetchJson<EnergyStats>("/api/user/credits", { cache: "no-store" }),
    enabled: hasUser,
    refetchInterval: hasUser ? 15_000 : false,
    refetchOnWindowFocus: hasUser,
  });

  const unlimitedQuery = useQuery({
    queryKey: ["dev-unlimited-energy"],
    queryFn: () =>
      fetchJson<{ enabled: boolean }>("/api/dev/unlimited-energy", {
        cache: "no-store",
      }),
    enabled: import.meta.env.DEV,
  });

  useEffect(() => {
    const onEnergyChanged = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.energy });
    };

    window.addEventListener("umkm:energy-changed", onEnergyChanged);
    return () => {
      window.removeEventListener("umkm:energy-changed", onEnergyChanged);
    };
  }, [queryClient]);

  const resetMutation = useMutation({
    mutationFn: async () => {
      await fetchJson<{ ok: boolean }>("/api/dev/add-energy", {
        method: "POST",
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.energy });
      notifyEnergyChanged();
    },
  });

  const unlimitedMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      await fetchJson<{ enabled: boolean }>("/api/dev/unlimited-energy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["dev-unlimited-energy"],
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.energy });
      notifyEnergyChanged();
    },
  });

  const stats = energyQuery.data;

  if (!hasUser) {
    return null;
  }

  if (energyQuery.isPending && !stats) {
    return (
      <div className="flex items-center gap-2 text-xs text-surface-warm-white/50">
        <div className="size-2 animate-pulse rounded-full bg-surface-warm-white/30" />
        <span>Energi…</span>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const percentage = Math.round((stats.remaining / stats.limit) * 100);
  const isLow = percentage < 20;
  const isEmpty = stats.remaining === 0;
  const resetLabel = formatResetTime(stats.resetsAt);

  return (
    <div
      className="flex items-center gap-2"
      title={[
        `Energi: ${formatNumber(stats.remaining)}/${formatNumber(stats.limit)}`,
        `Terpakai: ${formatNumber(stats.used)}`,
        `Input: ${formatNumber(stats.inputTokens)} token`,
        `Output: ${formatNumber(stats.outputTokens)} token`,
        "Energi = biaya model (USD) × 1.000.000",
        `Reset ${resetLabel} (WIB)`,
        energyQuery.isFetching ? "Memperbarui…" : "",
      ]
        .filter(Boolean)
        .join("\n")}
    >
      <div className="flex items-center gap-1.5">
        <div
          className={`size-2 rounded-full ${isEmpty ? "bg-[#ffb4a6]" : isLow ? "bg-yellow-400" : "bg-green-400"} ${energyQuery.isFetching ? "animate-pulse" : ""}`}
        />
        <span className="text-xs font-medium text-surface-warm-white/78">
          {formatNumber(stats.remaining)}
        </span>
        <span className="text-xs text-surface-warm-white/50">Energi</span>
      </div>

      <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-warm-white/12 sm:block">
        <div
          className={`h-full rounded-full transition-all duration-300 ${isEmpty ? "bg-[#ffb4a6]" : isLow ? "bg-yellow-400" : "bg-green-400"}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {import.meta.env.DEV && (
        <>
          <button
            type="button"
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
            className="rounded-md bg-surface-warm-white/10 px-2 py-0.5 text-[10px] font-medium text-surface-warm-white/60 transition hover:bg-surface-warm-white/20 hover:text-surface-warm-white/80 disabled:opacity-50"
            title="Dev: reset energy hari ini"
          >
            {resetMutation.isPending ? "…" : "Reset"}
          </button>
          <button
            type="button"
            onClick={() =>
              unlimitedMutation.mutate(!unlimitedQuery.data?.enabled)
            }
            disabled={unlimitedMutation.isPending}
            className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition disabled:opacity-50 ${
              unlimitedQuery.data?.enabled
                ? "bg-green-400/20 text-green-300 hover:bg-green-400/30"
                : "bg-surface-warm-white/10 text-surface-warm-white/60 hover:bg-surface-warm-white/20 hover:text-surface-warm-white/80"
            }`}
            title="Dev: toggle unlimited energy"
          >
            {unlimitedMutation.isPending
              ? "…"
              : unlimitedQuery.data?.enabled
                ? "Unlimited ✓"
                : "Unlimited"}
          </button>
        </>
      )}
    </div>
  );
}

function formatResetTime(resetsAt: string): string {
  const reset = new Date(resetsAt);
  const now = new Date();
  const diffMs = reset.getTime() - now.getTime();

  if (diffMs <= 0) {
    return "segera";
  }

  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  const diffMinutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));

  if (diffHours >= 1) {
    return `dalam ${diffHours} jam`;
  }

  return `dalam ${diffMinutes} menit`;
}

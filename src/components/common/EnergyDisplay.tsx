"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { EnergyBoosterModal } from "@/components/payment/EnergyBoosterModal";
import { useSession } from "@/lib/auth-client";
import { fetchJson, queryKeys } from "@/lib/query-client";

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
  const [modalOpen, setModalOpen] = useState(false);
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

  useEffect(() => {
    const onEnergyChanged = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.energy });
    };

    window.addEventListener("umkm:energy-changed", onEnergyChanged);
    return () => {
      window.removeEventListener("umkm:energy-changed", onEnergyChanged);
    };
  }, [queryClient]);

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
        <span className="hidden text-xs text-surface-warm-white/50 min-[400px]:inline">
          Energi
        </span>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="ml-1 flex size-5 items-center justify-center rounded-full bg-[#ff7a59]/10 text-[#ff7a59] transition hover:bg-[#ff7a59]/20 active:scale-95 focus:outline-none"
          title="Top-up Energi Premium"
        >
          <PlusIcon className="size-3" />
        </button>
      </div>

      <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-warm-white/12 sm:block">
        <div
          className={`h-full rounded-full transition-all duration-300 ${isEmpty ? "bg-[#ffb4a6]" : isLow ? "bg-yellow-400" : "bg-green-400"}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <EnergyBoosterModal open={modalOpen} onOpenChange={setModalOpen} />
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

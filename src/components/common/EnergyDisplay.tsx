"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { EnergyBoosterModal } from "@/components/payment/EnergyBoosterModal";
import { useSession } from "@/lib/auth-client";
import { fetchJson, queryKeys } from "@/lib/query-client";

type EnergyStats = {
  remaining: number;
  granted: number;
  used: number;
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
      <div className="flex items-center gap-2 text-xs text-[#5f5f5d] dark:text-surface-warm-white/50">
        <div className="size-2 animate-pulse rounded-full bg-black/20 dark:bg-surface-warm-white/30" />
        <span>Energi…</span>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const percentage =
    stats.granted > 0
      ? Math.min(100, Math.round((stats.remaining / stats.granted) * 100))
      : 0;
  const isLow = percentage < 20;
  const isEmpty = stats.remaining === 0;

  return (
    <div
      className="flex items-center gap-2"
      title={[
        `Energi tersisa: ${formatNumber(stats.remaining)}`,
        `Diberikan: ${formatNumber(stats.granted)}`,
        `Terpakai: ${formatNumber(stats.used)}`,
        `Input: ${formatNumber(stats.inputTokens)} token`,
        `Output: ${formatNumber(stats.outputTokens)} token`,
        "Energi = biaya model (USD) × 1.000.000",
        energyQuery.isFetching ? "Memperbarui…" : "",
      ]
        .filter(Boolean)
        .join("\n")}
    >
      <div className="flex items-center gap-1 sm:gap-1.5">
        <div
          className={`size-2 shrink-0 rounded-full ${isEmpty ? "bg-[#ffb4a6]" : isLow ? "bg-yellow-400" : "bg-green-400"} ${energyQuery.isFetching ? "animate-pulse" : ""}`}
        />
        <span className="text-xs font-medium text-[#1c1c1c] dark:text-surface-warm-white/78">
          {formatNumber(stats.remaining)}
        </span>
        <span className="hidden text-xs text-[#5f5f5d] dark:text-surface-warm-white/50 md:inline">
          Energi
        </span>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="ml-0.5 inline-flex items-center gap-0.5 rounded-full bg-[#ff7a59]/15 px-1.5 py-0.5 text-[10px] font-semibold text-aurora-orange transition hover:bg-[#ff7a59]/25 active:scale-95 focus:outline-none sm:ml-1 sm:gap-1 sm:px-2 sm:text-[11px]"
          title="Top-up Energi Premium"
        >
          <PlusIcon className="size-3" />
          <span className="hidden xs:inline">Topup</span>
        </button>
      </div>

      <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-black/10 dark:bg-surface-warm-white/12 sm:block">
        <div
          className={`h-full rounded-full transition-all duration-300 ${isEmpty ? "bg-[#ffb4a6]" : isLow ? "bg-yellow-400" : "bg-green-400"}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <EnergyBoosterModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}

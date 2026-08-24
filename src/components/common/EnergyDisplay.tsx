"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, Zap } from "lucide-react";
import { useEffect, useState } from "react";

import { EnergyLedger } from "@/components/common/EnergyLedger";
import { EnergyBoosterModal } from "@/components/payment/EnergyBoosterModal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSession } from "@/lib/auth/auth-client";
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

export function EnergyDisplay({ projectId }: { projectId?: string }) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
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
    <div className="flex items-center gap-1.5 sm:gap-2">
      <div
        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border/90 bg-card px-2.5 py-1 shadow-2xs transition-colors hover:border-foreground/30 hover:bg-muted dark:border-white/15 dark:bg-[#252522] dark:hover:bg-[#2e2e2a]"
        onClick={() => setLedgerOpen(true)}
        role="button"
        tabIndex={0}
        aria-label="Lihat riwayat pemakaian energi"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            setLedgerOpen(true);
          }
        }}
        title="Klik untuk melihat riwayat pemakaian energi"
      >
        <div
          className={`size-2 shrink-0 rounded-full ${isEmpty ? "bg-[#ffb4a6]" : isLow ? "bg-amber-400" : "bg-emerald-500"} ${energyQuery.isFetching ? "animate-pulse" : ""}`}
        />
        <span className="text-xs font-bold text-foreground dark:text-surface-warm-white">
          {formatNumber(stats.remaining)}
        </span>
        <span className="hidden text-xs font-medium text-muted-foreground md:inline">
          Energi
        </span>
      </div>

      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border/90 bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-2xs transition-all hover:border-foreground/30 hover:bg-muted active:scale-95 dark:border-white/15 dark:bg-[#252522] dark:hover:bg-[#2e2e2a] dark:text-surface-warm-white focus-visible:outline-none"
        title="Tambah Energi"
      >
        <PlusIcon className="size-3 text-muted-foreground dark:text-surface-warm-white/70" />
        <span>Tambah</span>
      </button>

      <EnergyBoosterModal open={modalOpen} onOpenChange={setModalOpen} />

      <Dialog open={ledgerOpen} onOpenChange={setLedgerOpen}>
        <DialogContent className="flex max-h-[80dvh] flex-col gap-spacing-7 overflow-hidden sm:max-w-lg">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-spacing-3">
              <Zap className="size-4" />
              Riwayat Energi
            </DialogTitle>
            <DialogDescription>
              Daftar pemakaian energi per langkah untuk akun dan proyek ini.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
            <EnergyLedger projectId={projectId} limit={50} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

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
  const [stats, setStats] = useState<EnergyStats | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch("/api/user/credits", { cache: "no-store" });
      if (response.ok) {
        setStats((await response.json()) as EnergyStats);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadStats();
    const interval = window.setInterval(() => void loadStats(), 15_000);

    const onFocus = () => void loadStats();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadStats();
      }
    };
    const onEnergyChanged = () => void loadStats();

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("umkm:energy-changed", onEnergyChanged);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("umkm:energy-changed", onEnergyChanged);
    };
  }, [loadStats]);

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
        `Output: ${formatNumber(stats.outputTokens)} token (×2 energi)`,
        "Rumus: input + (2 × output)",
        `Reset ${resetLabel} (WIB)`,
      ].join("\n")}
    >
      <div className="flex items-center gap-1.5">
        <div
          className={`size-2 rounded-full ${isEmpty ? "bg-[#ffb4a6]" : isLow ? "bg-yellow-400" : "bg-green-400"}`}
        />
        <span className="text-xs font-medium text-surface-warm-white/78">
          {formatNumber(stats.remaining)}
        </span>
        <span className="text-xs text-surface-warm-white/42">Energi</span>
      </div>

      <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-warm-white/12 sm:block">
        <div
          className={`h-full rounded-full transition-all duration-300 ${isEmpty ? "bg-[#ffb4a6]" : isLow ? "bg-yellow-400" : "bg-green-400"}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {import.meta.env.DEV && (
        <button
          type="button"
          onClick={() => void handleDevAddEnergy(loadStats)}
          className="rounded-md bg-surface-warm-white/10 px-2 py-0.5 text-[10px] font-medium text-surface-warm-white/60 transition hover:bg-surface-warm-white/20 hover:text-surface-warm-white/80"
          title="Dev: reset energy hari ini"
        >
          Reset
        </button>
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

async function handleDevAddEnergy(refresh: () => Promise<void>) {
  try {
    const response = await fetch("/api/dev/add-energy", { method: "POST" });
    if (response.ok) {
      await refresh();
      window.dispatchEvent(new Event("umkm:energy-changed"));
    }
  } catch {
    // ignore
  }
}

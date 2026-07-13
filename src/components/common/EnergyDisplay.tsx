"use client";

import { useCallback, useEffect, useState } from "react";

type EnergyStats = {
  remaining: number;
  used: number;
  limit: number;
  resetsAt: string;
};

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
    const interval = window.setInterval(() => void loadStats(), 30_000);
    return () => window.clearInterval(interval);
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
      title={`Energi harian. Terpakai ${stats.used}/${stats.limit}. Reset ${resetLabel}.`}
    >
      <div className="flex items-center gap-1.5">
        <div
          className={`size-2 rounded-full ${isEmpty ? "bg-[#ffb4a6]" : isLow ? "bg-yellow-400" : "bg-green-400"}`}
        />
        <span className="text-xs font-medium text-surface-warm-white/78">
          {stats.remaining}
        </span>
        <span className="text-xs text-surface-warm-white/42">Energi</span>
      </div>

      <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-warm-white/12 sm:block">
        <div
          className={`h-full rounded-full transition-all duration-300 ${isEmpty ? "bg-[#ffb4a6]" : isLow ? "bg-yellow-400" : "bg-green-400"}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
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

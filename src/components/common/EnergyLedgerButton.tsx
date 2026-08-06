"use client";

import { ChevronRight, Zap } from "lucide-react";
import { useState } from "react";

import { EnergyLedger } from "@/components/common/EnergyLedger";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function EnergyLedgerButton({
  projectId,
  variant = "pill",
  onActivate,
}: {
  projectId: string;
  variant?: "pill" | "row";
  onActivate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isRow = variant === "row";
  return (
    <>
      <button
        type="button"
        onClick={() => {
          onActivate?.();
          setOpen(true);
        }}
        aria-label="Lihat riwayat energi"
        className={cn(
          isRow
            ? "inline-flex h-11 w-full items-center gap-spacing-3 rounded-radius-md px-spacing-3 text-sm text-surface-warm-white/82 hover:bg-surface-warm-white/8"
            : "inline-flex min-h-9 items-center gap-spacing-3 rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 px-spacing-5 text-xs font-medium text-surface-warm-white/80 hover:bg-surface-warm-white/10 hover:text-surface-warm-white",
        )}
      >
        <Zap
          className={cn(
            "shrink-0",
            isRow ? "size-4 text-surface-warm-white/64" : "size-4",
          )}
        />
        <span className={cn(isRow ? "flex-1 text-left" : "hidden sm:inline")}>
          {isRow ? "Riwayat Energi" : "Riwayat Energi"}
        </span>
        {isRow ? (
          <ChevronRight className="size-4 text-surface-warm-white/40" />
        ) : null}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[80dvh] flex-col gap-spacing-7 overflow-hidden sm:max-w-lg">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-spacing-3">
              <Zap className="size-4" />
              Riwayat Energi
            </DialogTitle>
            <DialogDescription>
              Daftar pemakaian energi per langkah untuk proyek ini.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
            <EnergyLedger projectId={projectId} limit={50} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

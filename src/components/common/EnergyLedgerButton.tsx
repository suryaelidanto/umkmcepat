"use client";

import { Zap } from "lucide-react";
import { useState } from "react";

import { EnergyLedger } from "@/components/common/EnergyLedger";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function EnergyLedgerButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center gap-spacing-3 rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 px-spacing-5 text-xs font-medium text-surface-warm-white/80 hover:bg-surface-warm-white/10 hover:text-surface-warm-white"
        aria-label="Lihat riwayat energi"
      >
        <Zap className="size-4" />
        <span className="hidden sm:inline">Riwayat Energi</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-spacing-3">
              <Zap className="size-4" />
              Riwayat Energi
            </DialogTitle>
            <DialogDescription>
              Daftar pemakaian energi per langkah untuk proyek ini.
            </DialogDescription>
          </DialogHeader>
          <EnergyLedger projectId={projectId} limit={50} />
        </DialogContent>
      </Dialog>
    </>
  );
}

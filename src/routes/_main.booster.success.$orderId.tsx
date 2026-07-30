import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2Icon } from "lucide-react";

import { DarkPage } from "@/components/ui/surface";

function BoosterSuccessPage() {
  return (
    <DarkPage className="flex min-h-[60vh] items-center justify-center py-spacing-14">
      <div className="mx-auto flex max-w-xs flex-col items-center gap-4 py-6 text-center">
        <CheckCircle2Icon className="size-16 text-green-400" />
        <span className="text-lg font-bold text-surface-warm-white">
          Pembayaran Sukses!
        </span>
        <span className="max-w-xs text-xs leading-normal text-surface-warm-white/60">
          Terima kasih, energi booster premium Anda telah ditambahkan secara
          instan dan sudah siap digunakan.
        </span>
        <Link
          to="/"
          className="mt-4 rounded-lg bg-white/[0.08] px-6 py-2 text-xs font-semibold transition hover:bg-white/[0.12]"
        >
          Tutup
        </Link>
      </div>
    </DarkPage>
  );
}

export const Route = createFileRoute("/_main/booster/success/$orderId")({
  component: BoosterSuccessPage,
});

import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { AlertCircleIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { useState, useEffect } from "react";

import { DarkPage } from "@/components/ui/surface";
import { fetchJson } from "@/lib/query-client";

interface SuccessSearchParams {
  orderId?: string;
}

type PaymentStatusResponse = {
  success: boolean;
  orderId: string;
  status: string;
  amount: number;
  paymentMethod: string;
};

function BoosterSuccessPage() {
  const { orderId } = useSearch({ from: Route.id });
  const [status, setStatus] = useState<string>("PENDING");

  useEffect(() => {
    if (!orderId || status !== "PENDING") {
      return;
    }

    let isSubscribed = true;
    const interval = setInterval(async () => {
      try {
        const data = await fetchJson<PaymentStatusResponse>(
          `/api/payment/status/${orderId}`,
          { cache: "no-store" },
        );
        if (isSubscribed && data.success) {
          setStatus(data.status);
          if (data.status !== "PENDING") {
            clearInterval(interval);
          }
        }
      } catch {
        // polling — fail silently
      }
    }, 3000);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [orderId, status]);

  return (
    <DarkPage className="flex min-h-[60vh] items-center justify-center py-spacing-14">
      <div className="mx-auto flex max-w-xs flex-col items-center gap-4 py-6 text-center">
        {status === "COMPLETED" ? (
          <>
            <CheckCircle2Icon className="size-16 text-green-400 animate-bounce" />
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
          </>
        ) : status === "FAILED" ? (
          <>
            <AlertCircleIcon className="size-16 text-red-400 animate-pulse" />
            <span className="text-lg font-bold text-surface-warm-white">
              Pembayaran Gagal
            </span>
            <span className="max-w-xs text-xs leading-normal text-surface-warm-white/60">
              Terjadi masalah dalam pemrosesan transaksi. Silakan hubungi
              support atau coba lagi.
            </span>
            <Link
              to="/"
              className="mt-4 rounded-lg bg-aurora-orange px-6 py-2 text-xs font-semibold text-white transition hover:bg-aurora-orange/90"
            >
              Coba Lagi
            </Link>
          </>
        ) : (
          <>
            <Loader2Icon className="size-16 animate-spin text-surface-warm-white/60" />
            <span className="text-lg font-bold text-surface-warm-white">
              Menunggu Pembayaran
            </span>
            <span className="max-w-xs text-xs leading-normal text-surface-warm-white/60">
              Pembayaran kamu sedang diproses. Halaman ini akan memperbarui
              status secara otomatis.
            </span>
          </>
        )}
      </div>
    </DarkPage>
  );
}

export const Route = createFileRoute("/_main/booster/success")({
  validateSearch: (
    search: Record<string, string | undefined>,
  ): SuccessSearchParams => ({
    orderId: search.orderId,
  }),
  component: BoosterSuccessPage,
});

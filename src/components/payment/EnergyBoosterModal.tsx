import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2Icon,
  ZapIcon,
  CreditCardIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BOOSTER_PACKS, type BoosterPackId } from "@/lib/pakasir";
import { fetchJson, notifyEnergyChanged, queryKeys } from "@/lib/query-client";
import { isDev } from "@/lib/utils";

interface EnergyBoosterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PaymentSession = {
  success: boolean;
  orderId: string;
  amount: number;
  paymentNumber: string;
  status: string;
};

type PaymentStatusResponse = {
  success: boolean;
  orderId: string;
  status: string;
  amount: number;
  paymentMethod: string;
};

export function EnergyBoosterModal({
  open,
  onOpenChange,
}: EnergyBoosterModalProps) {
  const queryClient = useQueryClient();
  const [selectedPack, setSelectedPack] = useState<BoosterPackId>("starter");
  const [isCreating, setIsCreating] = useState(false);
  const [paymentSession, setPaymentSession] = useState<PaymentSession | null>(
    null,
  );
  const [paymentStatus, setPaymentStatus] = useState<string>("PENDING");

  // Reset states when modal is opened or closed
  useEffect(() => {
    if (!open) {
      setPaymentSession(null);
      setPaymentStatus("PENDING");
      setIsCreating(false);
    }
  }, [open]);

  // Polling payment status when a session is active
  useEffect(() => {
    if (!paymentSession || paymentStatus !== "PENDING") {
      return;
    }

    let isSubscribed = true;
    const interval = setInterval(async () => {
      try {
        const data = await fetchJson<PaymentStatusResponse>(
          `/api/payment/status/${paymentSession.orderId}`,
          { cache: "no-store" },
        );

        if (isSubscribed && data.success) {
          setPaymentStatus(data.status);

          if (data.status === "COMPLETED") {
            toast.success(
              "Pembayaran berhasil! Energi premium telah ditambahkan.",
            );
            // Refresh energy cache and notify UI.
            await queryClient.invalidateQueries({ queryKey: queryKeys.energy });
            notifyEnergyChanged();
            clearInterval(interval);
          } else if (data.status === "FAILED") {
            toast.error("Pembayaran gagal. Silakan coba lagi.");
            clearInterval(interval);
          }
        }
      } catch (err) {
        // Fail silently in polling to prevent console noise.
        console.warn("Polling payment status failed:", err);
      }
    }, 4000);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [paymentSession, paymentStatus, queryClient]);

  const handleBuy = async (packId: BoosterPackId) => {
    setIsCreating(true);
    try {
      const data = await fetchJson<PaymentSession>("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: packId, method: "qris" }),
      });

      if (data.success) {
        setPaymentSession(data);
        setPaymentStatus("PENDING");
      } else {
        toast.error("Gagal membuat pembayaran. Coba beberapa saat lagi.");
      }
    } catch (err) {
      console.error("[EnergyBoosterModal] error creating payment:", err);
      toast.error(
        err instanceof Error ? err.message : "Terjadi kesalahan koneksi.",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const getQRUrl = (payload: string) => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(payload)}`;
  };

  // Helper formatting for Indonesian Rupiah
  const formatRupiah = (value: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Helper formatting for Indonesian Energy Number
  const formatEnergy = (value: number) => {
    return new Intl.NumberFormat("id-ID").format(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-[#161614] text-surface-warm-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <ZapIcon className="size-5 text-yellow-400 fill-yellow-400" />
            <span>UMKM Cepat Booster Pack</span>
          </DialogTitle>
          <DialogDescription className="text-surface-warm-white/60">
            Energi gratis harian habis? Top-up energi booster permanen
            sebutuhnya. Energi premium tidak kedaluwarsa.
          </DialogDescription>
        </DialogHeader>

        {!paymentSession ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3">
              {(Object.keys(BOOSTER_PACKS) as BoosterPackId[]).map((key) => {
                const pack = BOOSTER_PACKS[key];
                let gimmickCoret = 0;
                let badge = "";

                if (key === "pocket") {
                  gimmickCoret = 15000;
                  badge = "Terlaris (Rp 2.900)";
                } else if (key === "starter") {
                  gimmickCoret = 45000;
                  badge = "Booster Murah (Diskon 80%)";
                } else if (key === "popular") {
                  gimmickCoret = 125000;
                  badge = "Terbaik (Diskon 80%)";
                } else if (key === "max") {
                  gimmickCoret = 299000;
                  badge = "Super Hemat (Diskon 80%)";
                }

                const isSelected = selectedPack === key;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedPack(key)}
                    className={`relative flex items-center justify-between rounded-lg border p-4 text-left transition ${
                      isSelected
                        ? "border-yellow-400/80 bg-yellow-400/5 text-surface-warm-white"
                        : "border-white/[0.08] bg-white/[0.02] text-surface-warm-white/80 hover:border-white/20 hover:bg-white/[0.04]"
                    }`}
                  >
                    {badge && (
                      <span className="absolute -top-2 left-3 rounded bg-yellow-400 px-1.5 py-0.5 text-[9px] font-bold text-black uppercase tracking-wider">
                        {badge}
                      </span>
                    )}

                    <div className="flex flex-col">
                      <span className="text-sm font-semibold">{pack.name}</span>
                      <span className="text-xs text-surface-warm-white/50">
                        +{formatEnergy(pack.energy)} Energi Premium
                      </span>
                    </div>

                    <div className="flex flex-col items-end">
                      <span className="text-xs text-surface-warm-white/40 line-through">
                        {formatRupiah(gimmickCoret)}
                      </span>
                      <span className="text-sm font-bold text-yellow-400">
                        {formatRupiah(pack.amount)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={isCreating}
              onClick={() => handleBuy(selectedPack)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-400 py-3 text-sm font-semibold text-black transition hover:bg-yellow-300 disabled:opacity-50"
            >
              {isCreating ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  <span>Membuat Invoice…</span>
                </>
              ) : (
                <>
                  <CreditCardIcon className="size-4" />
                  <span>Bayar Sekarang (QRIS)</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 py-4 text-center">
            {paymentStatus === "PENDING" && (
              <>
                <span className="text-xs text-yellow-400 font-bold uppercase tracking-widest animate-pulse">
                  Menunggu Pembayaran
                </span>
                <div className="rounded-lg bg-white p-3 shadow-md">
                  <img
                    src={getQRUrl(paymentSession.paymentNumber)}
                    alt="QRIS Code"
                    width={220}
                    height={220}
                    className="mx-auto block"
                  />
                </div>
                {isDev && (
                  <div className="rounded border border-dashed border-white/20 bg-white/5 px-2.5 py-1 text-[10px] text-surface-warm-white/70 font-mono select-all">
                    Dev Order ID: {paymentSession.orderId}
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-surface-warm-white/50">
                    Total Pembayaran:
                  </span>
                  <span className="text-lg font-bold text-yellow-400">
                    {formatRupiah(paymentSession.amount)}
                  </span>
                  <span className="text-[10px] text-surface-warm-white/40 max-w-xs leading-normal mt-2">
                    Scan kode QRIS di atas menggunakan aplikasi e-wallet (Gopay,
                    OVO, Dana, LinkAja) atau Mobile Banking Anda. Status akan
                    diperbarui otomatis.
                  </span>
                </div>
              </>
            )}

            {paymentStatus === "COMPLETED" && (
              <div className="flex flex-col items-center gap-2 py-6">
                <CheckCircle2Icon className="size-16 text-green-400 animate-bounce" />
                <span className="text-lg font-bold text-surface-warm-white">
                  Pembayaran Sukses!
                </span>
                <span className="text-xs text-surface-warm-white/60 max-w-xs leading-normal">
                  Terima kasih, energi booster premium Anda telah ditambahkan
                  secara instan dan sudah siap digunakan.
                </span>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="mt-4 rounded-lg bg-white/[0.08] px-6 py-2 text-xs font-semibold hover:bg-white/[0.12] transition"
                >
                  Tutup
                </button>
              </div>
            )}

            {paymentStatus === "FAILED" && (
              <div className="flex flex-col items-center gap-2 py-6">
                <AlertCircleIcon className="size-16 text-red-400 animate-pulse" />
                <span className="text-lg font-bold text-surface-warm-white">
                  Pembayaran Gagal
                </span>
                <span className="text-xs text-surface-warm-white/60 max-w-xs leading-normal">
                  Terjadi masalah dalam pemrosesan transaksi. Silakan hubungi
                  support atau coba lagi.
                </span>
                <button
                  type="button"
                  onClick={() => setPaymentSession(null)}
                  className="mt-4 rounded-lg bg-yellow-400 px-6 py-2 text-xs font-semibold text-black hover:bg-yellow-300 transition"
                >
                  Coba Lagi
                </button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

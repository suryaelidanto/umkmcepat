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

const PAKET_DETAILS: Record<
  BoosterPackId,
  { label: string; desc: string; detail: string }
> = {
  pocket: {
    label: "Eceran Hemat",
    desc: "Pas buat uji coba fitur",
    detail: "Bisa buat buat sekitar 10-15 project uji coba.",
  },
  starter: {
    label: "Usaha Rintisan",
    desc: "Ideal untuk toko online pemula",
    detail: "Mulai bangun kehadiran online tokomu dengan tenang.",
  },
  popular: {
    label: "Laris Manis",
    desc: "Paling Populer! Pendamping tumbuh cepat",
    detail: "Kebutuhan harian terpenuhi tanpa takut kehabisan energi.",
  },
  max: {
    label: "Juragan Besar",
    desc: "Sangat hemat, kuota melimpah harian",
    detail: "Pilihan terbaik untuk bisnis yang sering update halaman.",
  },
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

  const formatRupiah = (value: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatEnergy = (value: number) => {
    return new Intl.NumberFormat("id-ID").format(value);
  };

  const getGimmickCoret = (key: BoosterPackId) => {
    switch (key) {
      case "pocket":
        return 15000;
      case "starter":
        return 45000;
      case "popular":
        return 125000;
      case "max":
        return 299000;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border border-[#d8d5cc]/60 bg-[#161614] text-[#fcfbf8] rounded-radius-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <ZapIcon className="size-5 fill-[#ff7a59] text-[#ff7a59]" />
            <span>Booster Energi UMKM</span>
          </DialogTitle>
          <DialogDescription className="text-surface-warm-white/60">
            Energi gratis harian habis? Beli paket booster tambahan sekali
            bayar. Berlaku selamanya & tidak kedaluwarsa.
          </DialogDescription>
        </DialogHeader>

        {!paymentSession ? (
          <div className="flex flex-col gap-4">
            {/* Vertical list of pricing cards */}
            <div className="flex flex-col gap-2.5">
              {(Object.keys(BOOSTER_PACKS) as BoosterPackId[]).map((key) => {
                const pack = BOOSTER_PACKS[key];
                const local = PAKET_DETAILS[key];
                const gimmickCoret = getGimmickCoret(key);
                const isSelected = selectedPack === key;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedPack(key)}
                    className={`relative flex items-center justify-between rounded-radius-lg border p-4 text-left transition cursor-pointer ${
                      isSelected
                        ? "border-[#ff7a59] bg-[#ff7a59]/5 text-white"
                        : "border-white/[0.08] bg-white/[0.01] hover:border-white/15"
                    }`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-surface-warm-white">
                          {local.label}
                        </span>
                        {key === "popular" && (
                          <span className="rounded bg-[#ff7a59]/10 px-1.5 py-0.5 text-[8px] font-bold text-[#ff7a59] uppercase tracking-wider">
                            Terlaris
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-surface-warm-white/55">
                        {local.desc}
                      </span>
                      <span className="text-xs font-semibold text-[#ff7a59] mt-0.5">
                        +{formatEnergy(pack.energy)} Energi
                      </span>
                    </div>

                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-white/35 line-through">
                        {formatRupiah(gimmickCoret)}
                      </span>
                      <span className="text-sm font-extrabold text-[#f7a441]">
                        {formatRupiah(pack.amount)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* High contrast visual primary CTA button (very visible white bg on dark modal) */}
            <button
              type="button"
              disabled={isCreating}
              onClick={() => handleBuy(selectedPack)}
              className="flex w-full items-center justify-center gap-2 rounded-radius-lg bg-[#fcfbf8] py-3 text-sm font-bold text-[#1c1c1c] transition duration-200 hover:bg-[#eceae4] active:scale-[0.98] cursor-pointer disabled:opacity-50"
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
                <span className="text-xs text-[#ff7a59] font-bold uppercase tracking-widest animate-pulse">
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
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(paymentSession.orderId);
                      toast.success("Order ID copied to clipboard!");
                    }}
                    className="rounded border border-dashed border-white/20 bg-white/5 px-2.5 py-1 text-[10px] text-surface-warm-white/70 font-mono hover:bg-white/10 transition cursor-pointer select-all"
                  >
                    Dev Order ID: {paymentSession.orderId} (Click to copy)
                  </button>
                )}
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-surface-warm-white/50">
                    Total Pembayaran:
                  </span>
                  <span className="text-lg font-bold text-[#f7a441]">
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
                  className="mt-4 rounded-lg bg-aurora-orange px-6 py-2 text-xs font-semibold text-white hover:bg-aurora-orange/90 transition"
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

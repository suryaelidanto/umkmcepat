import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2Icon,
  ZapIcon,
  CreditCardIcon,
  CheckCircle2Icon,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type BoosterPackId,
  type BoosterPackResolved,
} from "@/lib/payment/mayar";
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
  paymentUrl: string;
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
    detail: "Energi tambahan untuk melanjutkan proyek tanpa takut kehabisan.",
  },
  max: {
    label: "Juragan Besar",
    desc: "Sangat hemat, energi tambahan melimpah",
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
  const creatingLockRef = useRef(false);
  const [paymentSession, setPaymentSession] = useState<PaymentSession | null>(
    null,
  );
  const [paymentStatus, setPaymentStatus] = useState<string>("PENDING");

  const packsQuery = useQuery({
    queryKey: queryKeys.boosterPacks,
    queryFn: () =>
      fetchJson<{ packs: BoosterPackResolved[] }>("/api/payment/packs", {
        cache: "no-store",
      }),
    enabled: open,
    staleTime: 30_000,
  });

  // Reset states when modal is opened or closed
  useEffect(() => {
    if (!open) {
      setPaymentSession(null);
      setPaymentStatus("PENDING");
      setIsCreating(false);
      creatingLockRef.current = false;
    }
  }, [open]);

  // Polling payment status when we have an active session
  useEffect(() => {
    if (!paymentSession?.orderId || paymentStatus === "SUCCESS") {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetchJson<PaymentStatusResponse>(
          `/api/payment/status/${paymentSession.orderId}`,
        );
        if (res.success && res.status === "SUCCESS") {
          setPaymentStatus("SUCCESS");
          notifyEnergyChanged();
          await queryClient.invalidateQueries({ queryKey: queryKeys.energy });
          await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
          toast.success("Pembayaran Berhasil! Energi telah ditambahkan.");
          clearInterval(interval);
        }
      } catch {
        // Silent fail on polling error
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [paymentSession, paymentStatus, queryClient]);

  const handleBuy = async (packId: BoosterPackId) => {
    if (creatingLockRef.current || isCreating) {
      return;
    }

    creatingLockRef.current = true;
    setIsCreating(true);

    try {
      const res = await fetchJson<PaymentSession>("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });

      if (res.success && res.paymentUrl) {
        setPaymentSession(res);
        setPaymentStatus("PENDING");
        // Open payment in new window/tab
        window.open(res.paymentUrl, "_blank");
      } else {
        toast.error("Gagal membuat sesi pembayaran. Coba lagi nanti.");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Terjadi kesalahan pembayaran.",
      );
    } finally {
      setIsCreating(false);
      creatingLockRef.current = false;
    }
  };

  const handleSimulatePayment = async () => {
    if (!paymentSession?.orderId) {
      return;
    }
    try {
      await fetchJson("/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "payment.received",
          data: {
            id: paymentSession.orderId,
            status: "SUCCESS",
          },
        }),
      });
      setPaymentStatus("SUCCESS");
      notifyEnergyChanged();
      await queryClient.invalidateQueries({ queryKey: queryKeys.energy });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      toast.success("Simulasi pembayaran berhasil!");
    } catch {
      toast.error("Gagal melakukan simulasi pembayaran.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="max-w-md border border-black/10 bg-[#fcfbf8] text-[#1c1c1c] transition-colors duration-200 dark:border-white/[0.08] dark:bg-[#161614] dark:text-surface-warm-white p-6"
      >
        <DialogHeader className="gap-1 text-left">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-[#1c1c1c] dark:text-surface-warm-white">
            <ZapIcon className="size-5 fill-aurora-orange text-aurora-orange" />
            <span>Booster Energi UMKM</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/60">
            Energi kamu habis? Beli paket booster tambahan sekali bayar. Berlaku
            selamanya & tidak kedaluwarsa.
          </DialogDescription>
        </DialogHeader>

        {!paymentSession ? (
          <div className="flex flex-col gap-4">
            {packsQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-[#5f5f5d] dark:text-surface-warm-white/60">
                <Loader2Icon className="size-4 animate-spin" />
                Memuat paket…
              </div>
            ) : packsQuery.isError || !packsQuery.data?.packs?.length ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-[#5f5f5d] dark:text-surface-warm-white/70">
                  Paket belum bisa dimuat. Coba lagi.
                </p>
                <button
                  type="button"
                  onClick={() => void packsQuery.refetch()}
                  className="rounded-radius-lg border border-black/15 px-3 py-1.5 text-xs font-semibold text-[#1c1c1c] hover:bg-black/5 dark:border-white/15 dark:text-surface-warm-white dark:hover:bg-white/5"
                >
                  Muat ulang
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {packsQuery.data.packs.map((pack) => {
                  const key = pack.id;
                  const local = PAKET_DETAILS[key];
                  const showDiscount = pack.discountPercent > 0;
                  const isSelected = selectedPack === key;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedPack(key)}
                      className={`relative flex items-center justify-between rounded-radius-lg border p-4 text-left transition cursor-pointer ${
                        isSelected
                          ? "border-[#ff7a59] bg-[#ff7a59]/10 text-[#1c1c1c] dark:bg-[#ff7a59]/5 dark:text-white"
                          : "border-black/10 bg-black/[0.02] hover:border-black/20 dark:border-white/[0.08] dark:bg-white/[0.01] dark:hover:border-white/15"
                      }`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-[#1c1c1c] dark:text-surface-warm-white">
                            {local.label}
                          </span>
                          {key === "popular" && (
                            <span className="rounded bg-[#ff7a59]/15 px-1.5 py-0.5 text-[8px] font-bold text-[#ff7a59] uppercase tracking-wider">
                              Terlaris
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-[#5f5f5d] dark:text-surface-warm-white/55">
                          {local.desc}
                        </span>
                        <span className="text-xs font-semibold text-[#ff7a59] mt-0.5">
                          +{formatEnergy(pack.energy)} Energi
                        </span>
                      </div>

                      <div className="flex flex-col items-end gap-0.5">
                        {showDiscount ? (
                          <div className="flex items-center gap-1">
                            <span className="rounded bg-red-500 text-white font-semibold px-1.5 py-0.5 text-[8px] font-bold">
                              Hemat {pack.discountPercent}%
                            </span>
                            <span className="text-[10px] text-[#5f5f5d] dark:text-white/35 line-through">
                              {formatRupiah(pack.compareAtAmount)}
                            </span>
                          </div>
                        ) : null}
                        <span className="text-sm font-extrabold text-[#f7a441]">
                          {formatRupiah(pack.amount)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              disabled={isCreating}
              onClick={() => handleBuy(selectedPack)}
              className="flex w-full items-center justify-center gap-2 rounded-radius-lg bg-[#1c1c1c] py-3 text-sm font-bold text-white transition duration-200 hover:bg-[#1c1c1c]/90 active:scale-[0.98] cursor-pointer disabled:opacity-50 dark:bg-[#fcfbf8] dark:text-[#1c1c1c] dark:hover:bg-[#eceae4]"
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
          <div className="flex flex-col items-center gap-5 py-4 text-center">
            {paymentStatus === "SUCCESS" ? (
              <>
                <div className="flex size-14 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                  <CheckCircle2Icon className="size-8" />
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-bold text-[#1c1c1c] dark:text-surface-warm-white">
                    Pembayaran Berhasil!
                  </h3>
                  <p className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/70">
                    Energi berhasil ditambahkan ke akun Anda. Anda bisa langsung
                    melanjutkan membuat website.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="w-full rounded-radius-lg bg-green-600 py-2.5 text-xs font-bold text-white hover:bg-green-500"
                >
                  Selesai
                </button>
              </>
            ) : (
              <>
                <div className="flex size-14 items-center justify-center rounded-full bg-[#ff7a59]/10 text-[#ff7a59]">
                  <Loader2Icon className="size-8 animate-spin" />
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-bold text-[#1c1c1c] dark:text-surface-warm-white">
                    Menunggu Pembayaran
                  </h3>
                  <p className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/70">
                    Silakan selesaikan pembayaran QRIS di tab browser yang
                    terbuka. Halaman ini akan otomatis diperbarui.
                  </p>
                </div>

                <div className="flex w-full flex-col gap-2 pt-2">
                  <a
                    href={paymentSession.paymentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-radius-lg border border-black/15 bg-black/[0.04] py-2.5 text-xs font-bold text-[#1c1c1c] hover:bg-black/[0.08] dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                  >
                    Buka Ulang Halaman Pembayaran
                  </a>

                  {isDev && (
                    <button
                      type="button"
                      onClick={handleSimulatePayment}
                      className="w-full rounded-radius-lg bg-[#ff7a59]/20 py-2 text-xs font-semibold text-[#ff7a59] hover:bg-[#ff7a59]/30"
                    >
                      [DEV] Simulasi Bayar Berhasil
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatEnergy(amount: number): string {
  return new Intl.NumberFormat("id-ID").format(amount);
}

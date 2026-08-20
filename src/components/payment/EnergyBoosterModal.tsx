import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon, ZapIcon, CreditCardIcon } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

import {
  BoosterMascot,
  WaitingPaymentMascot,
  SuccessMascot,
} from "@/components/payment/mascots/BoosterMascots";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type BoosterPackResolved } from "@/lib/payment/mayar";
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

export function EnergyBoosterModal({
  open,
  onOpenChange,
}: EnergyBoosterModalProps) {
  const queryClient = useQueryClient();
  const [selectedPack, setSelectedPack] = useState<string>("");
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

  // Auto-select first or popular pack from DB response
  useEffect(() => {
    if (packsQuery.data?.packs?.length && !selectedPack) {
      const popular = packsQuery.data.packs.find((p) => p.isPopular);
      setSelectedPack(popular ? popular.id : packsQuery.data.packs[0]!.id);
    }
  }, [packsQuery.data?.packs, selectedPack]);

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

  const handleBuy = async (packId: string) => {
    if (creatingLockRef.current || isCreating) {
      return;
    }

    creatingLockRef.current = true;
    setIsCreating(true);

    try {
      // 2s pleasant transitional redirection delay + invoice creation
      const [res] = await Promise.all([
        fetchJson<PaymentSession>("/api/payment/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ packId }),
        }),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);

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
      await fetchJson("/api/dev/simulate-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: paymentSession.orderId,
        }),
      });
      setPaymentStatus("SUCCESS");
      notifyEnergyChanged();
      await queryClient.invalidateQueries({ queryKey: queryKeys.energy });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      toast.success("Simulasi pembayaran berhasil!");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Gagal melakukan simulasi pembayaran.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="max-w-md border border-black/10 bg-[#fcfbf8] text-[#1c1c1c] transition-colors duration-200 dark:border-white/[0.08] dark:bg-[#161614] dark:text-surface-warm-white p-5 sm:p-6"
      >
        <DialogHeader className="gap-1 text-left">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-[#1c1c1c] dark:text-surface-warm-white">
            <ZapIcon className="size-5 fill-accent-orange text-accent-orange" />
            <span>Booster Energi UMKM</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/60">
            Energi kamu habis? Beli paket booster tambahan sekali bayar. Berlaku
            selamanya & tidak kedaluwarsa.
          </DialogDescription>
        </DialogHeader>

        {isCreating ? (
          <div className="flex flex-col items-center gap-3.5 py-4 text-center animate-in fade-in-50 duration-300">
            <BoosterMascot
              packId={selectedPack}
              state="selected"
              className="size-28 sm:size-32"
            />

            <div className="inline-flex items-center gap-1.5 rounded-full bg-accent-orange/15 border border-accent-orange/30 px-3 py-1 text-xs font-bold text-accent-orange shadow-2xs">
              <Loader2Icon className="size-3.5 animate-spin" />
              <span>Menyiapkan Invoice…</span>
            </div>

            <div className="flex flex-col gap-1 max-w-xs">
              <h3 className="text-lg font-bold text-[#1c1c1c] dark:text-surface-warm-white">
                Mengarahkan ke Pembayaran…
              </h3>
              <p className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/70 leading-relaxed">
                Tab pembayaran Mayar akan segera terbuka. Selesaikan pembayaran
                dengan aman.
              </p>
            </div>
          </div>
        ) : !paymentSession ? (
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
                  const showDiscount = pack.discountPercent > 0;
                  const isSelected = selectedPack === key;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedPack(key)}
                      className={`relative flex items-center justify-between rounded-2xl border p-3.5 sm:p-4 text-left transition-all cursor-pointer ${
                        isSelected
                          ? "border-accent-orange bg-orange-500/[0.08] ring-1 ring-accent-orange/40 shadow-sm text-[#1c1c1c] dark:border-accent-orange dark:bg-accent-orange-subtle dark:text-surface-warm-white dark:ring-0"
                          : "border-black/10 bg-white/70 hover:border-black/20 hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.02] dark:hover:border-white/15 dark:hover:bg-white/[0.04]"
                      }`}
                    >
                      {/* Left: Mascot & Details */}
                      <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                        <div className="shrink-0">
                          <BoosterMascot
                            packId={key}
                            state={
                              isCreating && isSelected
                                ? "launching"
                                : isSelected
                                  ? "selected"
                                  : "idle"
                            }
                            className="size-12 sm:size-13"
                          />
                        </div>

                        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-bold text-[#1c1c1c] dark:text-surface-warm-white">
                              {pack.name}
                            </span>
                            {pack.isPopular ? (
                              <span className="rounded-full bg-accent-orange-subtle border border-accent-orange-border px-2 py-0.2 text-[9px] font-bold text-accent-orange uppercase tracking-wider shrink-0 shadow-2xs">
                                Terlaris
                              </span>
                            ) : null}
                          </div>
                          <span className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/60 line-clamp-1 leading-relaxed">
                            {pack.desc}
                          </span>
                          <span className="text-xs font-bold text-accent-orange mt-0.5">
                            +{formatEnergy(pack.energy)} Energi
                          </span>
                        </div>
                      </div>

                      {/* Right: Pricing & Discount Badge */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {showDiscount ? (
                          <div className="flex items-center gap-1.5">
                            <span className="whitespace-nowrap shrink-0 rounded-full bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 text-[9px] font-bold text-rose-600 dark:bg-rose-400/15 dark:border-rose-400/30 dark:text-rose-300">
                              Hemat {pack.discountPercent}%
                            </span>
                            <span className="whitespace-nowrap text-[11px] text-[#5f5f5d]/70 dark:text-white/35 line-through">
                              {formatRupiah(pack.compareAtAmount)}
                            </span>
                          </div>
                        ) : null}
                        <span className="whitespace-nowrap text-sm sm:text-base font-extrabold text-[#1c1c1c] dark:text-surface-warm-white">
                          {formatRupiah(pack.amount)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {(() => {
              const activePackData = packsQuery.data?.packs?.find(
                (p) => p.id === selectedPack,
              );
              const formattedPrice = activePackData
                ? formatRupiah(activePackData.amount)
                : "";

              return (
                <button
                  type="button"
                  disabled={isCreating}
                  onClick={() => handleBuy(selectedPack)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1c1c1c] py-3.5 text-sm font-bold text-white transition duration-200 hover:bg-[#1c1c1c]/90 active:scale-[0.98] cursor-pointer disabled:opacity-50 dark:bg-[#fcfbf8] dark:text-[#1c1c1c] dark:hover:bg-[#eceae4] shadow-sm"
                >
                  {isCreating ? (
                    <>
                      <ZapIcon className="size-4 animate-bounce text-amber-400 fill-amber-400" />
                      <span>Meluncur ke Pembayaran…</span>
                    </>
                  ) : (
                    <>
                      <CreditCardIcon className="size-4" />
                      <span>
                        {formattedPrice
                          ? `Bayar ${formattedPrice} Sekarang`
                          : "Bayar Sekarang"}
                      </span>
                    </>
                  )}
                </button>
              );
            })()}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            {paymentStatus === "SUCCESS" ? (
              <>
                <SuccessMascot className="size-24" />
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
                  className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white hover:bg-emerald-500 shadow-sm cursor-pointer transition"
                >
                  Selesai & Lanjutkan
                </button>
              </>
            ) : (
              <>
                <WaitingPaymentMascot className="size-24" />
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-bold text-[#1c1c1c] dark:text-surface-warm-white">
                    Selesaikan Pembayaran
                  </h3>
                  <p className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/70">
                    Selesaikan pembayaran di halaman Mayar yang terbuka ya.
                    Halaman ini akan otomatis menyambutmu saat sukses!
                  </p>
                </div>

                <div className="flex w-full flex-col gap-2 pt-2">
                  <a
                    href={paymentSession.paymentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-black/15 bg-white py-3 text-xs font-bold text-[#1c1c1c] hover:bg-black/5 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 shadow-2xs transition"
                  >
                    Buka Ulang Halaman Pembayaran
                  </a>

                  {isDev && (
                    <button
                      type="button"
                      onClick={handleSimulatePayment}
                      className="w-full rounded-xl bg-accent-orange/15 border border-accent-orange/30 py-2 text-xs font-bold text-accent-orange hover:bg-accent-orange/25 transition cursor-pointer"
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

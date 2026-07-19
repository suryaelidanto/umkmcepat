import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2Icon,
  ZapIcon,
  CreditCardIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  SparklesIcon,
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

type PrototypeStyle = "classic" | "aurora" | "grid" | "slider" | "retro";

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

  // Prototype style selection (defaults to 'classic', user can switch if isDev is true)
  const [protoStyle, setProtoStyle] = useState<PrototypeStyle>("classic");

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
      <DialogContent
        className={`max-w-md transition-all duration-300 ${
          protoStyle === "retro"
            ? "border-4 border-black bg-[#faf6ee] text-[#1c1c1c] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
            : protoStyle === "aurora"
              ? "border border-white/10 bg-[#0d0d0c] text-[#fcfbf8] shadow-[0_0_40px_rgba(120,103,255,0.15)]"
              : "border border-[#d8d5cc]/60 bg-[#161614] text-[#fcfbf8]"
        }`}
      >
        {/* Prototype Style Switcher: Only visible in dev/staging */}
        {isDev && !paymentSession && (
          <div className="mb-2 rounded border border-white/10 bg-white/5 p-1.5">
            <span className="mb-1 block text-center text-[9px] font-bold tracking-wider text-surface-warm-white/40 uppercase">
              Prototype Variants (Dev Mode)
            </span>
            <div className="grid grid-cols-5 gap-1 text-[10px]">
              {(
                [
                  "classic",
                  "aurora",
                  "grid",
                  "slider",
                  "retro",
                ] as PrototypeStyle[]
              ).map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setProtoStyle(style)}
                  className={`rounded px-1 py-1 text-center font-medium capitalize transition cursor-pointer ${
                    protoStyle === style
                      ? "bg-yellow-400 text-black font-bold"
                      : "bg-white/5 text-surface-warm-white/60 hover:bg-white/10"
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>
        )}

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <ZapIcon
              className={`size-5 ${
                protoStyle === "retro"
                  ? "fill-[#1c1c1c] text-[#1c1c1c]"
                  : "fill-yellow-400 text-yellow-400"
              }`}
            />
            <span>Booster Kuota UMKM</span>
          </DialogTitle>
          <DialogDescription
            className={
              protoStyle === "retro"
                ? "text-black/70"
                : "text-surface-warm-white/60"
            }
          >
            Kuotamu habis? Beli paket booster tambahan sekali bayar. Berlaku
            selamanya & tidak kedaluwarsa.
          </DialogDescription>
        </DialogHeader>

        {!paymentSession ? (
          <div className="flex flex-col gap-4">
            {/* MODEL 1: KLASIK MODERN (Clean Cards) */}
            {protoStyle === "classic" && (
              <div className="grid gap-3">
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
                      className={`relative flex items-center justify-between rounded-lg border p-4 text-left transition cursor-pointer ${
                        isSelected
                          ? "border-yellow-400/80 bg-yellow-400/5 text-surface-warm-white"
                          : "border-white/[0.08] bg-white/[0.02] text-surface-warm-white/80 hover:border-white/20 hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold">
                            {local.label}
                          </span>
                          {key === "popular" && (
                            <span className="rounded bg-yellow-400/10 px-1.5 py-0.5 text-[9px] font-bold text-yellow-400 uppercase tracking-wider">
                              Laris
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-surface-warm-white/50">
                          {local.desc}
                        </span>
                        <span className="text-[10px] text-yellow-400/70 mt-0.5">
                          +{formatEnergy(pack.energy)} Energi
                        </span>
                      </div>

                      <div className="flex flex-col items-end">
                        <span className="text-xs text-[#5f5f5d] line-through">
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
            )}

            {/* MODEL 2: AURORA GLOW (Cyberpunk/Neon Accent) */}
            {protoStyle === "aurora" && (
              <div className="grid gap-3">
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
                      className={`relative flex items-center justify-between rounded-xl border p-4 text-left transition duration-300 cursor-pointer overflow-hidden ${
                        isSelected
                          ? "border-[#7867ff] bg-[#7867ff]/5 text-white shadow-[0_0_15px_rgba(120,103,255,0.2)]"
                          : "border-white/5 bg-white/[0.01] hover:border-white/10 hover:bg-white/[0.02]"
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500" />
                      )}
                      <div className="flex flex-col gap-0.5 z-10">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold tracking-wide">
                            {local.label}
                          </span>
                          {key === "popular" && (
                            <span className="rounded bg-gradient-to-r from-[#ff7a59] to-[#ee4f9b] px-2 py-0.5 text-[8px] font-extrabold text-white uppercase tracking-wider">
                              Rekomendasi
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-white/50">
                          {local.desc}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-bold text-[#ff7a59] mt-1">
                          <SparklesIcon className="size-3 fill-[#ff7a59]" />
                          <span>+{formatEnergy(pack.energy)} Kuota</span>
                        </span>
                      </div>

                      <div className="flex flex-col items-end z-10">
                        <span className="text-xs text-white/30 line-through">
                          {formatRupiah(gimmickCoret)}
                        </span>
                        <span
                          className={`text-sm font-extrabold ${isSelected ? "text-white" : "text-[#f7a441]"}`}
                        >
                          {formatRupiah(pack.amount)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* MODEL 3: GRID COMPARISON */}
            {protoStyle === "grid" && (
              <div className="grid grid-cols-2 gap-2.5">
                {(Object.keys(BOOSTER_PACKS) as BoosterPackId[]).map((key) => {
                  const pack = BOOSTER_PACKS[key];
                  const local = PAKET_DETAILS[key];
                  const isSelected = selectedPack === key;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedPack(key)}
                      className={`relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition cursor-pointer ${
                        isSelected
                          ? "border-yellow-400 bg-yellow-400/5 text-white"
                          : "border-white/[0.08] bg-white/[0.01] hover:border-white/15"
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-surface-warm-white/40 uppercase tracking-widest">
                          Paket
                        </span>
                        <span className="text-sm font-bold text-surface-warm-white mt-1">
                          {local.label.split(" ")[0]}
                        </span>
                        <span className="text-[10px] text-surface-warm-white/55 leading-tight mt-1">
                          {local.desc}
                        </span>
                        <span className="text-xs font-black text-yellow-400 mt-2.5">
                          +{formatEnergy(pack.energy / 1000)}K Kuota
                        </span>
                      </div>

                      <div className="mt-4 pt-2 border-t border-white/5 flex flex-col">
                        <span className="text-xs text-white/35 line-through">
                          {formatRupiah(getGimmickCoret(key))}
                        </span>
                        <span className="text-sm font-black text-yellow-400">
                          {formatRupiah(pack.amount)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* MODEL 4: RANGE SLIDER / CONVERSATIONAL SELECTOR */}
            {protoStyle === "slider" && (
              <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center">
                  <span className="text-xs font-bold text-yellow-400 uppercase tracking-widest">
                    {PAKET_DETAILS[selectedPack].label}
                  </span>
                  <p className="text-sm font-medium text-surface-warm-white mt-1.5">
                    {PAKET_DETAILS[selectedPack].desc}
                  </p>
                  <div className="my-4 flex items-center justify-center gap-1.5">
                    <span className="text-3xl font-black text-white">
                      +{formatEnergy(BOOSTER_PACKS[selectedPack].energy)}
                    </span>
                    <span className="text-xs text-surface-warm-white/50 font-bold uppercase">
                      Kuota
                    </span>
                  </div>
                  <div className="text-[11px] text-surface-warm-white/60 px-4 leading-normal">
                    {PAKET_DETAILS[selectedPack].detail}
                  </div>
                  <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between px-2">
                    <span className="text-xs text-white/30 line-through">
                      Harga Normal:{" "}
                      {formatRupiah(getGimmickCoret(selectedPack))}
                    </span>
                    <span className="text-base font-extrabold text-yellow-400">
                      Cukup Bayar:{" "}
                      {formatRupiah(BOOSTER_PACKS[selectedPack].amount)}
                    </span>
                  </div>
                </div>

                {/* Range steps */}
                <div className="flex flex-col gap-1 px-1">
                  <div className="flex justify-between text-[10px] text-surface-warm-white/40 font-bold px-1">
                    <span>ECERAN</span>
                    <span>RINTISAN</span>
                    <span>LARIS</span>
                    <span>JURAGAN</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={1}
                    value={Object.keys(BOOSTER_PACKS).indexOf(selectedPack)}
                    onChange={(e) => {
                      const idx = parseInt(e.target.value, 10);
                      const key = Object.keys(BOOSTER_PACKS)[
                        idx
                      ] as BoosterPackId;
                      setSelectedPack(key);
                    }}
                    className="w-full accent-yellow-400 h-1 bg-white/10 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* MODEL 5: RETRO LOKAL / NEOBRUTALISM */}
            {protoStyle === "retro" && (
              <div className="grid gap-3.5">
                {(Object.keys(BOOSTER_PACKS) as BoosterPackId[]).map((key) => {
                  const pack = BOOSTER_PACKS[key];
                  const local = PAKET_DETAILS[key];
                  const isSelected = selectedPack === key;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedPack(key)}
                      className={`relative flex items-center justify-between border-2 border-black p-3.5 text-left transition-all duration-150 cursor-pointer ${
                        isSelected
                          ? "bg-yellow-300 translate-x-[2px] translate-y-[2px] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                          : "bg-white hover:bg-yellow-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                      }`}
                    >
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-black">
                            {local.label}
                          </span>
                          {key === "popular" && (
                            <span className="border border-black bg-black text-yellow-300 px-1.5 py-0.5 text-[8px] font-black uppercase">
                              REKOMENDASI
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-black/75 mt-0.5 font-medium">
                          {local.desc}
                        </span>
                        <span className="text-xs font-extrabold text-black mt-2">
                          +{formatEnergy(pack.energy)} Kuota Permanen
                        </span>
                      </div>

                      <div className="flex flex-col items-end justify-center pl-2">
                        <span className="text-[10px] text-black/40 line-through">
                          {formatRupiah(getGimmickCoret(key))}
                        </span>
                        <span className="text-sm font-black text-black">
                          {formatRupiah(pack.amount)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Buy button */}
            <button
              type="button"
              disabled={isCreating}
              onClick={() => handleBuy(selectedPack)}
              className={`flex w-full items-center justify-center gap-2 py-3 text-sm font-bold transition duration-200 cursor-pointer disabled:opacity-50 ${
                protoStyle === "retro"
                  ? "border-2 border-black bg-yellow-300 text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
                  : protoStyle === "aurora"
                    ? "rounded-xl bg-gradient-to-r from-[#7867ff] via-[#ee4f9b] to-[#ff7a59] text-white hover:brightness-110 active:scale-[0.98]"
                    : "rounded-lg bg-yellow-400 text-black hover:bg-yellow-300 active:scale-[0.98]"
              }`}
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

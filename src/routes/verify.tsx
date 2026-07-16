import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/lib/navigation";
import { fetchJson, queryKeys } from "@/lib/query-client";

export const Route = createFileRoute("/verify")({
  component: VerifyPage,
});

type FlowState = "phone" | "otp" | "done";

function VerifyPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [flowState, setFlowState] = useState<FlowState>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const isDev = import.meta.env.DEV;

  const verificationQuery = useQuery({
    queryKey: queryKeys.verification,
    queryFn: () =>
      fetchJson<{ verified: boolean }>("/api/user/verification", {
        cache: "no-store",
      }),
    staleTime: 10_000,
  });

  useEffect(() => {
    if (verificationQuery.data?.verified) {
      router.replace("/");
    }
  }, [router, verificationQuery.data?.verified]);

  const sendOtpMutation = useMutation({
    mutationFn: async (phoneValue: string) =>
      fetchJson<{ expiresAt?: string }>("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneValue }),
      }),
    onSuccess: (data) => {
      setExpiresAt(data.expiresAt ?? null);
      setFlowState("otp");
      setError("");
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Gagal mengirim OTP.",
      );
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async (payload: { phone: string; code: string }) =>
      fetchJson<{ message?: string }>("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      setFlowState("done");
      // Write through cache immediately so MainChrome doesn't redirect back.
      queryClient.setQueryData(queryKeys.verification, { verified: true });
      await queryClient.invalidateQueries({ queryKey: queryKeys.verification });
      setTimeout(() => router.replace("/"), 1500);
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Verifikasi gagal.",
      );
    },
  });

  const skipMutation = useMutation({
    mutationFn: async () =>
      fetchJson<{ ok?: boolean }>("/api/dev/skip-verification", {
        method: "POST",
      }),
    onSuccess: async () => {
      setFlowState("done");
      queryClient.setQueryData(queryKeys.verification, { verified: true });
      await queryClient.invalidateQueries({ queryKey: queryKeys.verification });
      setTimeout(() => router.replace("/"), 1500);
    },
    onError: () => {
      setError("Gagal skip verifikasi.");
    },
  });

  if (verificationQuery.isPending || verificationQuery.data?.verified) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#10100f]">
        <div className="text-center">
          <div className="mx-auto size-8 animate-spin rounded-full border-2 border-surface-warm-white/12 border-t-surface-warm-white/82" />
          <p className="mt-4 text-sm text-surface-warm-white/62">
            Memeriksa status verifikasi...
          </p>
        </div>
      </div>
    );
  }

  if (flowState === "done") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#10100f]">
        <div className="text-center">
          <div className="mx-auto mb-4 size-12 rounded-full bg-green-500/20 p-3">
            <svg
              className="size-6 text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-surface-warm-white">
            Verifikasi berhasil!
          </h1>
          <p className="mt-2 text-sm text-surface-warm-white/62">
            Selamat datang di UMKM Cepat. Mengalihkan...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#10100f] px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-surface-warm-white/10 bg-[#1d1d1a] p-6">
          <h1 className="text-lg font-semibold text-surface-warm-white">
            Verifikasi Nomor Telepon
          </h1>
          <p className="mt-2 text-sm text-surface-warm-white/62">
            Kami perlu verifikasi nomor WhatsApp kamu untuk melindungi platform
            dari penyalahgunaan.
          </p>

          {flowState === "phone" && (
            <div className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="phone"
                  className="block text-sm font-medium text-surface-warm-white/78"
                >
                  Nomor WhatsApp
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+6281234567890"
                  className="mt-1 w-full rounded-lg border border-surface-warm-white/12 bg-[#262622] px-3 py-2 text-sm text-surface-warm-white placeholder:text-surface-warm-white/38 focus:border-surface-warm-white/30 focus:outline-none"
                  disabled={sendOtpMutation.isPending}
                />
                <p className="mt-1 text-xs text-surface-warm-white/50">
                  Format: +628xxxxxxxxxx
                </p>
              </div>

              {error && <p className="text-sm text-[#ffb4a6]">{error}</p>}

              <Button
                onClick={() => {
                  if (!phone.trim()) {
                    setError("Masukkan nomor telepon.");
                    return;
                  }
                  setError("");
                  sendOtpMutation.mutate(phone.trim());
                }}
                disabled={sendOtpMutation.isPending || !phone.trim()}
                className="w-full"
              >
                {sendOtpMutation.isPending ? "Mengirim..." : "Kirim Kode OTP"}
              </Button>

              {isDev && (
                <>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-surface-warm-white/10" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-[#1d1d1a] px-2 text-surface-warm-white/50">
                        atau
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setError("");
                      skipMutation.mutate();
                    }}
                    disabled={skipMutation.isPending}
                    className="w-full"
                  >
                    {skipMutation.isPending
                      ? "Melewati..."
                      : "Skip verifikasi (dev mode)"}
                  </Button>
                </>
              )}
            </div>
          )}

          {flowState === "otp" && (
            <div className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="otp"
                  className="block text-sm font-medium text-surface-warm-white/78"
                >
                  Kode OTP
                </label>
                <input
                  id="otp"
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="6 digit"
                  className="mt-1 w-full rounded-lg border border-surface-warm-white/12 bg-[#262622] px-3 py-2 text-sm text-surface-warm-white placeholder:text-surface-warm-white/38 focus:border-surface-warm-white/30 focus:outline-none"
                  disabled={verifyOtpMutation.isPending}
                />
                {expiresAt ? (
                  <p className="mt-1 text-xs text-surface-warm-white/50">
                    Berlaku sampai{" "}
                    {new Date(expiresAt).toLocaleTimeString("id-ID")}
                  </p>
                ) : null}
              </div>

              {error && <p className="text-sm text-[#ffb4a6]">{error}</p>}

              <Button
                onClick={() => {
                  if (!otp.trim()) {
                    setError("Masukkan kode OTP.");
                    return;
                  }
                  setError("");
                  verifyOtpMutation.mutate({
                    phone: phone.trim(),
                    code: otp.trim(),
                  });
                }}
                disabled={verifyOtpMutation.isPending || !otp.trim()}
                className="w-full"
              >
                {verifyOtpMutation.isPending
                  ? "Memverifikasi..."
                  : "Verifikasi"}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFlowState("phone");
                  setError("");
                }}
                className="w-full"
              >
                Ganti nomor
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

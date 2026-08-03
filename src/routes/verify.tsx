import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { useRouter } from "@/lib/navigation";
import { postVerifyDestination } from "@/lib/post-verify-destination";
import {
  fetchJson,
  fetchUserVerification,
  fetchWaitlistStatus,
  GATE_QUERY_OPTIONS,
  invalidateWaitlistStatus,
  queryKeys,
  type UserVerification,
} from "@/lib/query-client";
import { isUserVerified } from "@/lib/user-credits";

// Server-side gate: signed-in AND not yet verified. Already-verified users
// follow the same post-verify destination rule (home vs waitlist).
const requireUnverified = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await auth();
    if (!session?.user?.id) {
      throw redirect({ to: "/" });
    }
    if (await isUserVerified(session.user.id)) {
      const { resolveUserWaitlistStatus } =
        await import("@/routes/api.user.waitlist");
      const { isAdminEmail, isWaitlistApproved } =
        await import("@/lib/waitlist");
      const { isWaitlistEnabled } = await import("@/lib/waitlist-enabled");
      const email = session.user.email ?? "";
      const resolved = resolveUserWaitlistStatus({
        email,
        isAdmin: email ? isAdminEmail(email) : false,
        isApproved: email ? await isWaitlistApproved(email) : null,
        waitlistEnabled: await isWaitlistEnabled(),
      });
      throw redirect({ to: postVerifyDestination(resolved.status) });
    }
    return { ok: true as const };
  },
);

export const Route = createFileRoute("/verify")({
  beforeLoad: async () => {
    await requireUnverified();
  },
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
  const [doneDestination, setDoneDestination] = useState<"/" | "/waitlist">(
    "/",
  );

  const verificationQuery = useQuery({
    queryKey: queryKeys.verification,
    queryFn: fetchUserVerification,
    ...GATE_QUERY_OPTIONS,
  });

  const canUseDevTools = Boolean(verificationQuery.data?.canUseDevTools);

  async function finishVerificationSuccess() {
    setFlowState("done");
    // Write through cache immediately so MainChrome doesn't redirect back.
    const previous = queryClient.getQueryData<UserVerification>(
      queryKeys.verification,
    );
    queryClient.setQueryData(queryKeys.verification, {
      signedIn: true,
      verified: true,
      canUseDevTools: previous?.canUseDevTools ?? false,
    });
    await queryClient.invalidateQueries({ queryKey: queryKeys.verification });
    await invalidateWaitlistStatus(queryClient);
    let destination: "/" | "/waitlist" = "/waitlist";
    try {
      const status = await fetchWaitlistStatus();
      destination = postVerifyDestination(status.status);
    } catch {
      destination = "/waitlist";
    }
    setDoneDestination(destination);
    setTimeout(() => router.replace(destination), 1500);
  }

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
      await finishVerificationSuccess();
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
      await finishVerificationSuccess();
    },
    onError: () => {
      setError("Gagal skip verifikasi.");
    },
  });

  if (verificationQuery.isPending) {
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
            {doneDestination === "/waitlist"
              ? "Lanjut isi formulir antrean…"
              : "Selamat datang di UMKM Cepat. Mengalihkan..."}
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
                <div className="mt-1 flex items-stretch rounded-lg border border-surface-warm-white/12 bg-[#262622] focus-within:border-surface-warm-white/30 overflow-hidden">
                  <span className="flex items-center justify-center bg-surface-warm-white/5 px-3 text-sm font-medium text-surface-warm-white/50 select-none gap-2 border-r border-surface-warm-white/12">
                    <span className="text-base leading-none">🇮🇩</span>
                    +62
                  </span>
                  <input
                    id="phone"
                    type="text"
                    inputMode="numeric"
                    value={phone.startsWith("+62") ? phone.slice(3) : phone}
                    onChange={(e) => {
                      let digits = e.target.value.replace(/\D/g, "");
                      if (digits.startsWith("0")) {
                        digits = digits.slice(1);
                      }
                      if (digits.startsWith("62")) {
                        digits = digits.slice(2);
                      }
                      digits = digits.slice(0, 13);
                      setPhone(digits ? `+62${digits}` : "");
                    }}
                    placeholder="812345678..."
                    className="w-full bg-transparent px-3 py-2 text-sm text-surface-warm-white placeholder:text-surface-warm-white/38 focus:outline-none"
                    disabled={sendOtpMutation.isPending}
                  />
                </div>
                <p className="mt-1 text-xs text-surface-warm-white/50">
                  Format: 8xxxxxxxxxx (nomor WhatsApp aktif)
                </p>
                {phone &&
                  phone.replace(/\D/g, "").length >= 3 &&
                  phone.replace(/\D/g, "").length < 10 && (
                    <p className="mt-1 text-xs text-aurora-orange">
                      Nomor terlalu pendek (minimal 8 angka setelah +62).
                    </p>
                  )}
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
                disabled={
                  sendOtpMutation.isPending ||
                  phone.replace(/\D/g, "").length < 10 ||
                  phone.replace(/\D/g, "").length > 15
                }
                className="w-full bg-surface-warm-white text-foreground-primary hover:bg-surface-muted"
              >
                {sendOtpMutation.isPending ? "Mengirim..." : "Kirim Kode OTP"}
              </Button>

              {canUseDevTools && (
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
                    variant="ghost"
                    onClick={() => {
                      setError("");
                      skipMutation.mutate();
                    }}
                    disabled={skipMutation.isPending}
                    className="w-full border border-surface-warm-white/10 text-surface-warm-white hover:bg-surface-warm-white/5"
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
                className="w-full bg-surface-warm-white text-foreground-primary hover:bg-surface-muted"
              >
                {verifyOtpMutation.isPending
                  ? "Memverifikasi..."
                  : "Verifikasi"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setFlowState("phone");
                  setError("");
                }}
                className="w-full border border-surface-warm-white/10 text-surface-warm-white hover:bg-surface-warm-white/5"
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

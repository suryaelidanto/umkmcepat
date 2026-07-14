import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/lib/navigation";

export const Route = createFileRoute("/verify")({
  component: VerifyPage,
});

type VerificationState = "loading" | "phone" | "otp" | "done" | "error";

function VerifyPage() {
  const router = useRouter();
  const [state, setState] = useState<VerificationState>("loading");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const isDev = import.meta.env.DEV;

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/user/verification");
        if (response.ok) {
          const data = (await response.json()) as { verified: boolean };
          if (data.verified) {
            router.replace("/");
            return;
          }
        }
      } catch {
        // ignore
      }
      setState("phone");
    })();
  }, [router]);

  const sendOtp = useCallback(async () => {
    if (!phone.trim()) {
      setError("Masukkan nomor telepon.");
      return;
    }

    setSending(true);
    setError("");

    try {
      const response = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });

      const data = (await response.json()) as {
        message?: string;
        expiresAt?: string;
      };

      if (!response.ok) {
        setError(data.message ?? "Gagal mengirim OTP.");
        return;
      }

      setExpiresAt(data.expiresAt ?? null);
      setState("otp");
    } catch {
      setError("Gagal mengirim OTP. Coba lagi.");
    } finally {
      setSending(false);
    }
  }, [phone]);

  const verifyOtp = useCallback(async () => {
    if (!otp.trim()) {
      setError("Masukkan kode OTP.");
      return;
    }

    setVerifying(true);
    setError("");

    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), code: otp.trim() }),
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(data.message ?? "Verifikasi gagal.");
        return;
      }

      setState("done");
      setTimeout(() => router.replace("/"), 1500);
    } catch {
      setError("Verifikasi gagal. Coba lagi.");
    } finally {
      setVerifying(false);
    }
  }, [otp, phone, router]);

  const skipVerification = useCallback(async () => {
    setSkipping(true);
    setError("");

    try {
      const response = await fetch("/api/dev/skip-verification", {
        method: "POST",
      });

      if (!response.ok) {
        setError("Gagal skip verifikasi.");
        return;
      }

      setState("done");
      setTimeout(() => router.replace("/"), 1500);
    } catch {
      setError("Gagal skip verifikasi.");
    } finally {
      setSkipping(false);
    }
  }, [router]);

  if (state === "loading") {
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

  if (state === "done") {
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

          {state === "phone" && (
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
                  disabled={sending}
                />
                <p className="mt-1 text-xs text-surface-warm-white/42">
                  Format: +628xxxxxxxxxx
                </p>
              </div>

              {error && <p className="text-sm text-[#ffb4a6]">{error}</p>}

              <Button
                onClick={() => void sendOtp()}
                disabled={sending || !phone.trim()}
                className="w-full"
              >
                {sending ? "Mengirim..." : "Kirim Kode OTP"}
              </Button>

              {isDev && (
                <>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-surface-warm-white/10" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-[#1d1d1a] px-2 text-surface-warm-white/42">
                        atau
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void skipVerification()}
                    disabled={skipping}
                    className="w-full"
                  >
                    {skipping ? "Melewati..." : "Skip verifikasi (dev mode)"}
                  </Button>
                </>
              )}
            </div>
          )}

          {state === "otp" && (
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
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="123456"
                  maxLength={6}
                  className="mt-1 w-full rounded-lg border border-surface-warm-white/12 bg-[#262622] px-3 py-2 text-center text-lg font-mono tracking-widest text-surface-warm-white placeholder:text-surface-warm-white/38 focus:border-surface-warm-white/30 focus:outline-none"
                  disabled={verifying}
                />
                <p className="mt-1 text-xs text-surface-warm-white/42">
                  Masukkan 6 digit kode yang dikirim ke {phone}
                </p>
              </div>

              {error && <p className="text-sm text-[#ffb4a6]">{error}</p>}

              <Button
                onClick={() => void verifyOtp()}
                disabled={verifying || otp.length !== 6}
                className="w-full"
              >
                {verifying ? "Memverifikasi..." : "Verifikasi"}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setState("phone");
                  setOtp("");
                  setError("");
                }}
                className="w-full text-center text-xs text-surface-warm-white/42 hover:text-surface-warm-white/62"
              >
                Ganti nomor telepon
              </button>
            </div>
          )}

          {expiresAt && (
            <p className="mt-4 text-center text-xs text-surface-warm-white/42">
              Kode berlaku hingga{" "}
              {new Date(expiresAt).toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

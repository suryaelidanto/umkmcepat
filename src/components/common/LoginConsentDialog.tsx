"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

declare global {
  interface Window {
    turnstile?: {
      remove: (widgetId: string) => void;
      render: (
        element: HTMLElement,
        options: {
          callback: (token: string) => void;
          sitekey: string;
          theme?: "auto" | "dark" | "light";
        },
      ) => string;
      reset: (widgetId: string) => void;
    };
  }
}

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

export function LoginConsentDialog({
  description = "Masuk dengan Google untuk menyimpan proyek dan melanjutkan pembuatan website.",
  onOpenChange,
  open,
  title = "Masuk ke UMKM Cepat",
}: {
  description?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title?: string;
}) {
  const [agrees, setAgrees] = useState(false);
  const [devHumanCheck, setDevHumanCheck] = useState(false);
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef("");
  const hasTurnstile = Boolean(turnstileSiteKey);
  const canContinue = agrees && (hasTurnstile ? turnstileToken : devHumanCheck);

  useEffect(() => {
    if (!open || !hasTurnstile || !turnstileRef.current) {
      return;
    }

    let cancelled = false;

    async function renderTurnstile() {
      try {
        await loadTurnstileScript();
      } catch {
        setError("Turnstile belum bisa dimuat. Coba lagi nanti.");
        return;
      }

      if (cancelled || !window.turnstile || !turnstileRef.current) {
        return;
      }

      if (widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
      }

      widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
        callback: setTurnstileToken,
        sitekey: turnstileSiteKey,
        theme: "dark",
      });
    }

    void renderTurnstile();

    return () => {
      cancelled = true;

      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = "";
      }
    };
  }, [hasTurnstile, open]);

  function close(nextOpen: boolean) {
    onOpenChange(nextOpen);

    if (!nextOpen) {
      setAgrees(false);
      setDevHumanCheck(false);
      setError("");
      setIsVerifying(false);
      setTurnstileToken("");
    }
  }

  async function continueWithGoogle() {
    if (!canContinue || isVerifying) {
      return;
    }

    setError("");
    setIsVerifying(true);

    const response = await fetch("/api/auth/turnstile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: hasTurnstile ? turnstileToken : "dev" }),
    }).catch(() => null);

    if (!response?.ok) {
      setError("Verifikasi belum berhasil. Coba lagi.");
      setIsVerifying(false);
      window.turnstile?.reset(widgetIdRef.current);
      setTurnstileToken("");
      return;
    }

    await signIn("google", { callbackUrl: "/" });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-spacing-4">
          {hasTurnstile ? (
            <div className="rounded-radius-lg border border-surface-warm-white/10 bg-surface-warm-white/[0.055] p-spacing-5">
              <div ref={turnstileRef} />
            </div>
          ) : (
            <label className="flex gap-spacing-4 rounded-radius-lg border border-surface-warm-white/10 bg-surface-warm-white/[0.055] p-spacing-5 text-sm leading-6 text-surface-warm-white/78">
              <input
                type="checkbox"
                checked={devHumanCheck}
                onChange={(event) => setDevHumanCheck(event.target.checked)}
                className="mt-1 size-4 accent-surface-warm-white"
              />
              <span>
                Saya bukan bot spam dan tidak akan menyalahgunakan layanan.
              </span>
            </label>
          )}

          <label className="flex gap-spacing-4 rounded-radius-lg border border-surface-warm-white/10 bg-surface-warm-white/[0.055] p-spacing-5 text-sm leading-6 text-surface-warm-white/78">
            <input
              type="checkbox"
              checked={agrees}
              onChange={(event) => setAgrees(event.target.checked)}
              className="mt-1 size-4 accent-surface-warm-white"
            />
            <span>
              Saya setuju dengan{" "}
              <Link
                href="/terms"
                className="font-medium underline underline-offset-4"
              >
                Ketentuan penggunaan
              </Link>{" "}
              dan{" "}
              <Link
                href="/privacy"
                className="font-medium underline underline-offset-4"
              >
                Kebijakan privasi
              </Link>
              .
            </span>
          </label>
        </div>

        {error ? <p className="text-sm text-[#ffb4a8]">{error}</p> : null}

        <div className="flex flex-col-reverse gap-spacing-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="border-surface-warm-white/14 bg-transparent text-surface-warm-white/78 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"
            onClick={() => close(false)}
          >
            Nanti dulu
          </Button>
          <Button
            type="button"
            className="bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86"
            disabled={!canContinue || isVerifying}
            onClick={continueWithGoogle}
          >
            {isVerifying ? "Memeriksa..." : "Masuk dengan Google"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function loadTurnstileScript() {
  const existingScript = document.querySelector<HTMLScriptElement>(
    'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]',
  );

  if (window.turnstile) {
    return Promise.resolve();
  }

  if (existingScript) {
    return new Promise<void>((resolve) => {
      existingScript.addEventListener("load", () => resolve(), { once: true });
    });
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () =>
      reject(new Error("Turnstile gagal dimuat.")),
    );
    document.head.appendChild(script);
  });
}

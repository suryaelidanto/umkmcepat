"use client";

import { signIn } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

import { LegalDocumentContent } from "@/components/legal/LegalDocumentContent";
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
          appearance?: "always" | "execute" | "interaction-only";
          callback: (token: string) => void;
          "error-callback"?: () => void;
          execution?: "execute" | "render";
          "expired-callback"?: () => void;
          sitekey: string;
          size?: "compact" | "flexible" | "normal";
          theme?: "auto" | "dark" | "light";
          "timeout-callback"?: () => void;
        },
      ) => string;
      reset: (widgetId: string) => void;
    };
  }
}

const defaultTurnstileSiteKey =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

export function LoginConsentDialog({
  description,
  onOpenChange,
  open,
  title = "Masuk ke UMKM Cepat",
  turnstileSiteKey = defaultTurnstileSiteKey,
}: {
  description?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title?: string;
  turnstileSiteKey?: string;
}) {
  const [activeLegalDocument, setActiveLegalDocument] = useState<
    "privacy" | "terms" | null
  >(null);
  const [agrees, setAgrees] = useState(false);
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileElement, setTurnstileElement] =
    useState<HTMLDivElement | null>(null);
  const widgetIdRef = useRef("");
  const hasTurnstile = Boolean(turnstileSiteKey);
  const canContinue = agrees && (hasTurnstile ? turnstileToken : true);

  useEffect(() => {
    if (!open || !hasTurnstile || !turnstileElement) {
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

      if (cancelled || !window.turnstile) {
        return;
      }

      if (widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = "";
      }

      const element = turnstileElement;

      if (!element) {
        return;
      }

      element.replaceChildren();

      const widgetId = window.turnstile.render(element, {
        appearance: "always",
        callback: (token) => {
          setError("");
          setTurnstileToken(token);
        },
        "error-callback": () => {
          setError(
            "Turnstile gagal tampil. Cek domain widget, koneksi, atau blocker browser.",
          );
          setTurnstileToken("");
        },
        execution: "render",
        "expired-callback": () => setTurnstileToken(""),
        sitekey: turnstileSiteKey,
        size: "normal",
        theme: "dark",
        "timeout-callback": () => setTurnstileToken(""),
      });

      if (!widgetId) {
        setError("Turnstile gagal dimuat. Coba muat ulang halaman.");
        return;
      }

      widgetIdRef.current = widgetId;
    }

    void renderTurnstile();

    return () => {
      cancelled = true;

      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = "";
      }
    };
  }, [hasTurnstile, open, turnstileElement, turnstileSiteKey]);

  function close(nextOpen: boolean) {
    onOpenChange(nextOpen);

    if (!nextOpen) {
      setAgrees(false);
      setActiveLegalDocument(null);
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
      <DialogContent className={activeLegalDocument ? "max-w-2xl" : undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        {hasTurnstile ? (
          <div className="flex justify-center">
            <div
              ref={setTurnstileElement}
              className="min-h-[65px] w-[300px] max-w-full overflow-hidden rounded-radius-md [&_iframe]:rounded-radius-md"
            />
          </div>
        ) : null}

        <div className="space-y-spacing-4">
          <label className="flex gap-spacing-4 rounded-radius-xl border border-surface-warm-white/10 bg-surface-warm-white/[0.055] p-spacing-5 text-sm leading-6 text-surface-warm-white/78 transition hover:bg-surface-warm-white/[0.075]">
            <input
              type="checkbox"
              checked={agrees}
              onChange={(event) => setAgrees(event.target.checked)}
              className="mt-1 size-4 accent-surface-warm-white"
            />
            <span>
              Saya setuju dengan{" "}
              <button
                type="button"
                className="font-medium underline underline-offset-4 hover:text-surface-warm-white"
                onClick={(event) => {
                  event.preventDefault();
                  setActiveLegalDocument("terms");
                }}
              >
                Ketentuan penggunaan
              </button>{" "}
              dan{" "}
              <button
                type="button"
                className="font-medium underline underline-offset-4 hover:text-surface-warm-white"
                onClick={(event) => {
                  event.preventDefault();
                  setActiveLegalDocument("privacy");
                }}
              >
                Kebijakan privasi
              </button>
              .
            </span>
          </label>
        </div>

        {activeLegalDocument ? (
          <div className="max-h-[42vh] overflow-y-auto rounded-radius-lg border border-surface-warm-white/10 bg-surface-warm-white/[0.045] p-spacing-6">
            <LegalDocumentContent compact documentKey={activeLegalDocument} />
          </div>
        ) : null}

        {error ? <p className="text-sm text-[#ffb4a8]">{error}</p> : null}

        <Button
          type="button"
          className="h-12 w-full gap-spacing-4 bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86"
          disabled={!canContinue || isVerifying}
          onClick={continueWithGoogle}
        >
          <GoogleLogoIcon />
          {isVerifying ? "Memeriksa..." : "Masuk dengan Google"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function GoogleLogoIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-5"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z"
        fill="#EA4335"
      />
    </svg>
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

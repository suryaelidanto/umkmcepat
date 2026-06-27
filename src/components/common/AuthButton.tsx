"use client";

import { ChevronDown, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";

import { LoginConsentDialog } from "@/components/common/LoginConsentDialog";
import { AvatarFrame } from "@/components/ui/avatar-frame";
import { Button } from "@/components/ui/button";

export function AuthButton() {
  const { data: session, status } = useSession();
  const [loginOpen, setLoginOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (status === "loading") {
    return (
      <div
        className="h-9 w-20 rounded-radius-lg bg-surface-warm-white/8"
        aria-hidden="true"
      />
    );
  }

  if (!session?.user) {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLoginOpen(true)}
          className="rounded-radius-lg border-surface-warm-white/16 bg-surface-warm-white/8 px-spacing-8 text-surface-warm-white hover:bg-surface-warm-white/14 focus-visible:ring-2 focus-visible:ring-surface-warm-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#151515]"
        >
          Masuk
        </Button>
        <LoginConsentDialog open={loginOpen} onOpenChange={setLoginOpen} />
      </>
    );
  }

  const displayName = session.user.name?.trim() || "Akun";
  const initial = displayName[0]?.toUpperCase() || "U";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-[12rem] items-center gap-spacing-3 rounded-full border border-surface-warm-white/16 bg-surface-warm-white/8 px-spacing-3 py-spacing-2 text-sm text-surface-warm-white transition hover:bg-surface-warm-white/14 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-warm-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#151515] sm:max-w-[15rem] sm:px-spacing-4"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={open ? "Tutup menu akun" : "Buka menu akun"}
      >
        <AvatarFrame
          image={session.user.image || ""}
          initial={initial}
          className="size-7 bg-surface-warm-white text-xs font-semibold text-foreground-primary"
        />
        <span className="hidden min-w-0 truncate sm:block">{displayName}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-surface-warm-white/58 transition ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          id={menuId}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-52 overflow-hidden rounded-[18px] border border-surface-warm-white/12 bg-[#232321] p-spacing-2 text-surface-warm-white shadow-[0_18px_60px_rgba(0,0,0,0.28)]"
        >
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-spacing-3 rounded-radius-lg px-spacing-4 py-spacing-3 text-sm outline-none transition hover:bg-surface-warm-white/8 focus-visible:bg-surface-warm-white/8"
          >
            <UserRound className="size-4 text-surface-warm-white/62" />
            Profil
          </Link>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex w-full items-center gap-spacing-3 rounded-radius-lg px-spacing-4 py-spacing-3 text-left text-sm outline-none transition hover:bg-surface-warm-white/8 focus-visible:bg-surface-warm-white/8"
          >
            <LogOut className="size-4 text-surface-warm-white/62" />
            Keluar
          </button>
        </div>
      ) : null}
    </div>
  );
}

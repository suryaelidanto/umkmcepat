"use client";

import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { LoginConsentDialog } from "@/components/common/LoginConsentDialog";
import { AvatarFrame } from "@/components/ui/avatar-frame";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { signOut, useSession } from "@/lib/auth-client";

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
          className="rounded-md border border-white/14 bg-transparent px-spacing-7 text-surface-warm-white hover:bg-white/[0.06] focus-visible:ring-1 focus-visible:ring-white/50"
        >
          Masuk
        </Button>
        <LoginConsentDialog open={loginOpen} onOpenChange={setLoginOpen} />
      </>
    );
  }

  const displayName = session.user.name?.trim() || "Akun";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-[12rem] items-center gap-spacing-3 rounded-md border border-transparent bg-transparent px-spacing-2 py-spacing-1.5 text-sm text-surface-warm-white transition hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 sm:max-w-[15rem] sm:px-spacing-3"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={open ? "Tutup menu akun" : "Buka menu akun"}
      >
        <AvatarFrame
          seed={displayName}
          className="size-6 bg-surface-warm-white text-[10px] font-semibold text-foreground-primary"
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
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-48 overflow-hidden rounded-lg border border-white/10 bg-[#191918] p-1 text-surface-warm-white shadow-xl"
        >
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-spacing-3 rounded-md px-3 py-2.5 text-sm outline-none transition hover:bg-white/[0.06] focus-visible:bg-white/[0.06]"
          >
            <UserRound className="size-4 text-surface-warm-white/62" />
            Profil
          </Link>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex w-full items-center gap-spacing-3 rounded-md px-3 py-2.5 text-left text-sm outline-none transition hover:bg-white/[0.06] focus-visible:bg-white/[0.06]"
          >
            <LogOut className="size-4 text-surface-warm-white/62" />
            Keluar
          </button>
        </div>
      ) : null}
    </div>
  );
}

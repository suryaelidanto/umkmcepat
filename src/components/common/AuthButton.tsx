"use client";

import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { authSkin } from "@/components/common/chrome-skin";
import { useChromeSkin } from "@/components/common/ChromeSkinSwitcher";
import { LoginConsentDialog } from "@/components/common/LoginConsentDialog";
import { AvatarFrame } from "@/components/ui/avatar-frame";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { signOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function AuthButton() {
  const { data: session, status } = useSession();
  const [loginOpen, setLoginOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const skin = authSkin[useChromeSkin()];

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
          className={skin.login}
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
        className={cn(
          "flex max-w-[12rem] items-center gap-spacing-3 text-sm text-surface-warm-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-warm-white focus-visible:ring-offset-2 sm:max-w-[15rem]",
          skin.trigger,
        )}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={open ? "Tutup menu akun" : "Buka menu akun"}
      >
        <AvatarFrame
          image={session.user.image || ""}
          initial={initial}
          className={skin.avatar}
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
          className={cn(
            "absolute right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden text-surface-warm-white",
            skin.menu,
          )}
        >
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-spacing-3 text-sm outline-none transition",
              skin.item,
            )}
          >
            <UserRound className="size-4 text-surface-warm-white/62" />
            Profil
          </Link>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className={cn(
              "flex w-full items-center gap-spacing-3 text-left text-sm outline-none transition",
              skin.item,
            )}
          >
            <LogOut className="size-4 text-surface-warm-white/62" />
            Keluar
          </button>
        </div>
      ) : null}
    </div>
  );
}

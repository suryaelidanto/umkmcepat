"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  LifeBuoy,
  LogOut,
  Shield,
  UserRound,
  Zap,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { useStreamerMode } from "@/components/admin/streamer-mode-context";
import { LoginConsentDialog } from "@/components/common/LoginConsentDialog";
import { EnergyBoosterModal } from "@/components/payment/EnergyBoosterModal";
import { AvatarFrame } from "@/components/ui/avatar-frame";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { signOut, useSession } from "@/lib/auth-client";
import { mask } from "@/lib/mask";
import { usePathname } from "@/lib/navigation";
import { fetchJson } from "@/lib/query-client";

export function AuthButton() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const isBlockedPage = pathname === "/blocked";
  const [loginOpen, setLoginOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [boosterOpen, setBoosterOpen] = useState(false);

  const unreadQuery = useQuery({
    queryFn: () =>
      fetchJson<{ userUnreadCount: number }>("/api/support/unread-count"),
    queryKey: ["support", "unread-count"],
    enabled: !!session?.user?.id,
    refetchOnWindowFocus: true,
  });

  const unreadCount = unreadQuery.data?.userUnreadCount ?? 0;
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
      <>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled
          aria-busy="true"
          aria-label="Memuat akses masuk"
          className="min-w-[4.75rem] rounded-md border border-white/14 bg-transparent px-spacing-7 text-surface-warm-white opacity-50 cursor-not-allowed hover:bg-transparent focus-visible:ring-1 focus-visible:ring-white/50"
        >
          <span
            aria-hidden="true"
            className="h-3.5 w-10 animate-pulse rounded bg-surface-warm-white/35"
          />
        </Button>
        <LoginConsentDialog open={loginOpen} onOpenChange={setLoginOpen} />
      </>
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

  const streamerMode = useStreamerMode();
  const rawName = session.user.name ?? null;
  const displayName =
    streamerMode && rawName
      ? mask(rawName, "name").masked
      : rawName?.trim() || "Akun";

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
          {session.user.admin === true ? (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-spacing-3 rounded-md px-3 py-2.5 text-sm outline-none transition hover:bg-white/[0.06] focus-visible:bg-white/[0.06]"
            >
              <Shield className="size-4 text-surface-warm-white/62" />
              Admin
            </Link>
          ) : null}
          {isBlockedPage ? null : (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setBoosterOpen(true);
              }}
              className="flex w-full items-center gap-spacing-3 rounded-md px-3 py-2.5 text-left text-sm outline-none transition hover:bg-white/[0.06] focus-visible:bg-white/[0.06] text-[#ff7a59]"
            >
              <Zap className="size-4 fill-[#ff7a59]/10 text-[#ff7a59]" />
              Tambah Energi
            </button>
          )}
          <Link
            href="/support"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm outline-none transition hover:bg-white/[0.06] focus-visible:bg-white/[0.06]"
          >
            <div className="flex items-center gap-spacing-3">
              <LifeBuoy className="size-4 text-surface-warm-white/62" />
              <span>Dukungan</span>
            </div>
            {unreadCount > 0 ? (
              <span className="flex size-5 items-center justify-center rounded-full bg-[#ff7a59] text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            ) : null}
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
      <EnergyBoosterModal open={boosterOpen} onOpenChange={setBoosterOpen} />
    </div>
  );
}

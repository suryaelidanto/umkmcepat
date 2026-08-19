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

import { useStreamerMode } from "@/components/admin/streamer-mode/streamer-mode-context";
import { EnergyDisplay } from "@/components/common/EnergyDisplay";
import { LoginConsentDialog } from "@/components/common/LoginConsentDialog";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { EnergyBoosterModal } from "@/components/payment/EnergyBoosterModal";
import { AvatarFrame } from "@/components/ui/avatar-frame";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { MobileSheet } from "@/components/ui/mobile-sheet";
import { signOut, useSession } from "@/lib/auth/auth-client";
import { mask } from "@/lib/mask";
import { usePathname } from "@/lib/navigation";
import { fetchJson } from "@/lib/query-client";
import { useIsDesktopViewport } from "@/lib/use-is-desktop-viewport";

export function AuthButton() {
  const isDesktop = useIsDesktopViewport();
  const { data: session, status } = useSession();
  const streamerMode = useStreamerMode();
  const pathname = usePathname();
  const isBlockedPage = pathname === "/blocked";
  const [loginOpen, setLoginOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [boosterOpen, setBoosterOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

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
      if (!isDesktop) {
        return;
      }
      const target = event.target as Node;
      // Do not close if clicking inside container or dropdown
      if (containerRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
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

  if (!hydrated || status === "loading") {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled
          aria-busy="true"
          aria-label="Memuat akses masuk"
          className="min-w-[4.75rem] rounded-md border border-black/15 bg-transparent px-spacing-7 text-[#1c1c1c] opacity-50 cursor-not-allowed hover:bg-transparent focus-visible:ring-1 focus-visible:ring-black/50 dark:border-white/14 dark:text-surface-warm-white dark:focus-visible:ring-white/50"
        >
          <span
            aria-hidden="true"
            className="h-3.5 w-10 animate-pulse rounded bg-black/20 dark:bg-surface-warm-white/35"
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
          className="rounded-md border border-black/15 bg-black/[0.04] px-spacing-7 text-[#1c1c1c] font-semibold hover:bg-black/[0.08] focus-visible:ring-1 focus-visible:ring-black/50 dark:border-white/14 dark:bg-transparent dark:text-surface-warm-white dark:hover:bg-white/[0.06] dark:focus-visible:ring-white/50"
        >
          Masuk
        </Button>
        <LoginConsentDialog open={loginOpen} onOpenChange={setLoginOpen} />
      </>
    );
  }

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
        className="flex max-w-[12rem] items-center gap-spacing-3 rounded-md border border-transparent bg-transparent px-spacing-2 py-spacing-1.5 text-sm text-[#1c1c1c] transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/40 dark:text-surface-warm-white dark:hover:bg-white/[0.05] dark:focus-visible:ring-white/40 sm:max-w-[15rem] sm:px-spacing-3"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={open ? "Tutup menu akun" : "Buka menu akun"}
      >
        <div className="relative inline-flex size-6 shrink-0 items-center justify-center">
          <AvatarFrame
            seed={displayName}
            className="size-6 bg-black/10 text-[10px] font-semibold text-[#1c1c1c] dark:bg-surface-warm-white dark:text-foreground-primary"
          />
          {unreadCount > 0 && !open ? (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-accent-orange ring-2 ring-[#eceae4] dark:ring-[#151515]"
            />
          ) : null}
        </div>
        <span className="hidden min-w-0 truncate sm:block">{displayName}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-[#5f5f5d] transition dark:text-surface-warm-white/58 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <>
          {/* Desktop dropdown */}
          {isDesktop ? (
            <div
              id={menuId}
              data-testid="desktop-auth-menu"
              className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-48 overflow-hidden rounded-lg border border-black/10 bg-[#fcfbf8] p-1 text-[#1c1c1c] shadow-xl transition-colors duration-200 dark:border-white/10 dark:bg-[#191918] dark:text-surface-warm-white"
            >
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-spacing-3 rounded-md px-3 py-2.5 text-sm outline-none transition hover:bg-black/5 focus-visible:bg-black/5 dark:hover:bg-white/[0.06] dark:focus-visible:bg-white/[0.06]"
              >
                <UserRound className="size-4 text-[#5f5f5d] dark:text-surface-warm-white/62" />
                Profil
              </Link>
              {session.user.admin === true ? (
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-spacing-3 rounded-md px-3 py-2.5 text-sm outline-none transition hover:bg-black/5 focus-visible:bg-black/5 dark:hover:bg-white/[0.06] dark:focus-visible:bg-white/[0.06]"
                >
                  <Shield className="size-4 text-[#1c1c1c] dark:text-surface-warm-white" />
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
                  className="flex w-full items-center gap-spacing-3 rounded-md px-3 py-2.5 text-left text-sm outline-none transition hover:bg-black/5 focus-visible:bg-black/5 dark:hover:bg-white/[0.06] dark:focus-visible:bg-white/[0.06] text-accent-orange"
                >
                  <Zap className="size-4 fill-accent-orange/10 text-accent-orange" />
                  <span>Tambah Energi</span>
                </button>
              )}
              {!isBlockedPage ? (
                <Link
                  href="/support"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm outline-none transition hover:bg-black/5 focus-visible:bg-black/5 dark:hover:bg-white/[0.06] dark:focus-visible:bg-white/[0.06]"
                >
                  <div className="flex items-center gap-spacing-3">
                    <LifeBuoy className="size-4 text-[#5f5f5d] dark:text-surface-warm-white/62" />
                    <span>Dukungan</span>
                  </div>
                  {unreadCount > 0 ? (
                    <span className="flex size-5 items-center justify-center rounded-full bg-accent-orange text-[10px] font-bold text-white">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  ) : null}
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  void signOut({ callbackUrl: "/" });
                }}
                className="flex w-full items-center gap-spacing-3 rounded-md px-3 py-2.5 text-left text-sm text-[#5f5f5d] outline-none transition hover:bg-black/5 hover:text-destructive focus-visible:bg-black/5 dark:text-surface-warm-white/62 dark:hover:bg-white/[0.06] dark:hover:text-destructive dark:focus-visible:bg-white/[0.06]"
              >
                <LogOut className="size-4 text-[#5f5f5d] dark:text-surface-warm-white/62" />
                Keluar
              </button>
            </div>
          ) : (
            /* Mobile bottom sheet */
            <MobileSheet open={open} onOpenChange={setOpen}>
              <div className="flex flex-col gap-4 text-[#1c1c1c] dark:text-surface-warm-white">
                <div className="flex items-center justify-between rounded-xl border border-black/10 bg-black/5 p-3 dark:border-surface-warm-white/10 dark:bg-surface-warm-white/5">
                  <EnergyDisplay />
                  <ThemeToggle />
                </div>

                <div className="flex flex-col gap-1 divide-y divide-black/5 dark:divide-surface-warm-white/5">
                  <Link
                    href="/profile"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 text-sm font-medium hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/5 dark:active:bg-white/10 rounded-lg transition"
                  >
                    <UserRound className="size-4 text-[#5f5f5d] dark:text-surface-warm-white/62" />
                    Profil
                  </Link>
                  {session.user.admin === true ? (
                    <Link
                      href="/admin"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-3 py-3 text-sm font-medium hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/5 dark:active:bg-white/10 rounded-lg transition"
                    >
                      <Shield className="size-4 text-[#1c1c1c] dark:text-surface-warm-white" />
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
                      className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm font-medium text-accent-orange hover:bg-accent-orange-subtle active:bg-accent-orange-subtle/80 rounded-lg transition cursor-pointer"
                    >
                      <Zap className="size-4 fill-accent-orange/10 text-accent-orange" />
                      <span>Tambah Energi</span>
                    </button>
                  )}
                  {!isBlockedPage ? (
                    <Link
                      href="/support"
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between px-3 py-3 text-sm font-medium hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/5 dark:active:bg-white/10 rounded-lg transition"
                    >
                      <div className="flex items-center gap-3">
                        <LifeBuoy className="size-4 text-[#5f5f5d] dark:text-surface-warm-white/62" />
                        <span>Dukungan</span>
                      </div>
                      {unreadCount > 0 ? (
                        <span className="flex size-5 items-center justify-center rounded-full bg-accent-orange text-[10px] font-bold text-white">
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                      ) : null}
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      void signOut({ callbackUrl: "/" });
                    }}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm font-medium text-destructive hover:bg-destructive-subtle active:bg-destructive-subtle/80 rounded-lg transition cursor-pointer"
                  >
                    <LogOut className="size-4 text-destructive" />
                    Keluar
                  </button>
                </div>
              </div>
            </MobileSheet>
          )}
        </>
      ) : null}

      <EnergyBoosterModal open={boosterOpen} onOpenChange={setBoosterOpen} />
    </div>
  );
}

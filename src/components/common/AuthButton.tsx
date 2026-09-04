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
          className="min-w-[4.75rem] rounded-md border border-border bg-transparent px-spacing-7 text-foreground opacity-50 cursor-not-allowed hover:bg-transparent focus-visible:ring-1 focus-visible:ring-primary"
        >
          <span
            aria-hidden="true"
            className="h-3.5 w-10 animate-pulse rounded bg-muted"
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
          className="rounded-md border border-border bg-muted/40 px-spacing-7 font-semibold text-foreground hover:bg-muted focus-visible:ring-1 focus-visible:ring-primary"
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
        className="flex max-w-[12rem] items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground shadow-2xs transition-all hover:border-foreground/30 hover:bg-muted cursor-pointer active:scale-95 focus-visible:outline-none sm:max-w-[15rem]"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={open ? "Tutup menu akun" : "Buka menu akun"}
      >
        <div className="relative inline-flex size-6 shrink-0 items-center justify-center">
          <AvatarFrame
            seed={displayName}
            className="size-6 bg-muted text-[10px] font-semibold text-foreground"
          />
          {unreadCount > 0 && !open ? (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-accent-orange ring-2 ring-background"
            />
          ) : null}
        </div>
        <span className="hidden min-w-0 truncate sm:block">{displayName}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
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
              className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-48 overflow-hidden rounded-lg border border-border bg-card p-1 text-foreground shadow-xl transition-colors duration-200"
            >
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-spacing-3 rounded-md px-3 py-2.5 text-sm outline-none transition hover:bg-muted focus-visible:bg-muted"
              >
                <UserRound className="size-4 text-muted-foreground" />
                Profil
              </Link>
              {session.user.admin === true ? (
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-spacing-3 rounded-md px-3 py-2.5 text-sm outline-none transition hover:bg-muted focus-visible:bg-muted"
                >
                  <Shield className="size-4 text-foreground" />
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
                  className="flex w-full items-center gap-spacing-3 rounded-md px-3 py-2.5 text-left text-sm text-accent-orange outline-none transition hover:bg-muted focus-visible:bg-muted"
                >
                  <Zap className="size-4 fill-accent-orange/10 text-accent-orange" />
                  <span>Tambah Energi</span>
                </button>
              )}
              {!isBlockedPage ? (
                <Link
                  href="/support"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm outline-none transition hover:bg-muted focus-visible:bg-muted"
                >
                  <div className="flex items-center gap-spacing-3">
                    <LifeBuoy className="size-4 text-muted-foreground" />
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
                className="flex w-full items-center gap-spacing-3 rounded-md px-3 py-2.5 text-left text-sm text-muted-foreground outline-none transition hover:bg-muted hover:text-destructive focus-visible:bg-muted"
              >
                <LogOut className="size-4 text-muted-foreground" />
                Keluar
              </button>
            </div>
          ) : (
            <MobileSheet open={open} onOpenChange={setOpen}>
              <div className="flex flex-col gap-4 text-foreground">
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/50 p-3">
                  <EnergyDisplay />
                  <ThemeToggle />
                </div>

                <div className="flex flex-col gap-1 divide-y divide-border/40">
                  <Link
                    href="/profile"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition hover:bg-muted active:bg-muted/80"
                  >
                    <UserRound className="size-4 text-muted-foreground" />
                    Profil
                  </Link>
                  {session.user.admin === true ? (
                    <Link
                      href="/admin"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition hover:bg-muted active:bg-muted/80"
                    >
                      <Shield className="size-4 text-foreground" />
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
                      className="flex items-center justify-between rounded-lg px-3 py-3 text-sm font-medium transition hover:bg-muted active:bg-muted/80"
                    >
                      <div className="flex items-center gap-3">
                        <LifeBuoy className="size-4 text-muted-foreground" />
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

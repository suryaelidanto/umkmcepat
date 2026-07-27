"use client";

import { Home, Plus, User, Wallet } from "lucide-react";
import { useState } from "react";

import { Link } from "@/components/ui/link";
import { MobileSheet } from "@/components/ui/mobile-sheet";
import { useSession } from "@/lib/auth-client";
import { usePathname } from "@/lib/navigation";
import { isAdminEmail } from "@/lib/waitlist";

const ITEMS = [
  { href: "/", icon: Home, label: "Beranda" },
  { href: "/projects", icon: Wallet, label: "Proyek" },
  { href: "/projects/new", icon: Plus, label: "Buat" },
  { href: "/profile", icon: User, label: "Akun" },
] as const;

const OVERFLOW = [
  { href: "/waitlist", label: "Daftar antrean" },
  { href: "/privacy", label: "Privasi" },
  { href: "/terms", label: "Syarat" },
  { href: "/admin", label: "Admin", adminOnly: true },
] as const;

export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const { data: session } = useSession();
  const isAdmin =
    session?.user?.email != null && isAdminEmail(session.user.email);
  const overflow = OVERFLOW.filter(
    (item) => !("adminOnly" in item && item.adminOnly) || isAdmin,
  );

  return (
    <>
      <nav
        aria-label="Navigasi utama"
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch justify-around border-t border-surface-warm-white/10 bg-[#151515]/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] ${active ? "text-surface-warm-white" : "text-surface-warm-white/50"}`}
              href={item.href}
              key={item.href}
            >
              <Icon className="size-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          aria-label="Lainnya"
          className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-surface-warm-white/50"
          onClick={() => setMoreOpen(true)}
          type="button"
        >
          <span className="text-base">⋯</span>
          <span>Lainnya</span>
        </button>
      </nav>
      <MobileSheet onOpenChange={setMoreOpen} open={moreOpen} title="Lainnya">
        <ul className="flex flex-col gap-spacing-2">
          {overflow.map((item) => (
            <li key={item.href}>
              <Link
                className="block rounded-radius-md px-spacing-3 py-spacing-2 text-sm text-surface-warm-white/80 hover:bg-surface-warm-white/8"
                href={item.href}
                onClick={() => setMoreOpen(false)}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </MobileSheet>
    </>
  );
}

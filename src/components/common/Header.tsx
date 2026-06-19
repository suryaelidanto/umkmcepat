import Link from "next/link";

import { Button } from "@/components/ui/button";

const navLinks = [
  { href: "/#templates", label: "Templates" },
  { href: "/#cara-kerja", label: "Cara kerja" },
  { href: "/#open-source", label: "Open source" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-black/10 bg-[#f7f7f3]/85 text-[#111111] backdrop-blur-xl">
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[auto_1fr_auto] items-center px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="justify-self-start whitespace-nowrap rounded-md text-base font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a3d] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f7f3] sm:text-lg"
          aria-label="UMKM Cepat beranda"
        >
          UMKM Cepat
        </Link>

        <nav className="hidden items-center justify-center gap-8 text-sm text-black/60 md:flex" aria-label="Navigasi utama">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="outline-none transition-colors hover:text-black focus-visible:text-black">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center justify-end gap-2">
          <Button asChild size="sm" className="rounded-full bg-[#111111] px-5 text-white hover:bg-[#2a2a2a] focus-visible:ring-2 focus-visible:ring-[#ff5a3d] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f7f3]">
            <Link href="/create">Mulai</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="hidden rounded-full border-black/12 bg-white px-5 text-[#111111] hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-[#ff5a3d] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f7f3] sm:inline-flex">
            <Link href="/my-pages">Halaman saya</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

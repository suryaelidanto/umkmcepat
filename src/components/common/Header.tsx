import { Github, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { AuthButton } from "@/components/auth/AuthComponents";
import { Button } from "@/components/ui/button";

const navLinks = [
  { href: "/#fitur", label: "Fitur" },
  { href: "/#alur", label: "Alur" },
  { href: "/#open-source", label: "Open Source" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#171412]/10 bg-[#fbfaf8]/78 text-[#171412] backdrop-blur-xl supports-[backdrop-filter]:bg-[#fbfaf8]/68">
      <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="mr-6 flex items-center gap-2 rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[#f0437d] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbfaf8]"
          aria-label="UMKM Cepat beranda"
        >
          <Image src="/logo.svg" alt="" width={28} height={28} priority />
          <span className="font-semibold tracking-tight">UMKM Cepat</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-[#171412]/62 md:flex" aria-label="Navigasi utama">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-[#171412] focus-visible:text-[#171412] focus-visible:outline-none">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden rounded-full text-[#171412]/70 hover:bg-[#171412]/5 hover:text-[#171412] focus-visible:ring-2 focus-visible:ring-[#f0437d] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbfaf8] sm:inline-flex">
            <Link href="https://github.com/suryaelidanto/umkmcepat" target="_blank" rel="noreferrer" aria-label="Source code UMKM Cepat di GitHub">
              <Github className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>

          <Button asChild size="sm" className="rounded-full bg-[#171412] px-4 text-white hover:bg-[#171412]/90 focus-visible:ring-2 focus-visible:ring-[#f0437d] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbfaf8]">
            <Link href="/create">
              <Sparkles className="h-4 w-4 sm:mr-1" aria-hidden="true" />
              <span className="hidden sm:inline">Buat Halaman</span>
            </Link>
          </Button>

          <AuthButton />
        </div>
      </div>
    </header>
  );
}

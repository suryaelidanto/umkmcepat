import { Coffee, Github, Linkedin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const links = [
  { href: "/#fitur", label: "Fitur" },
  { href: "/#alur", label: "Alur" },
  { href: "/#open-source", label: "Open Source" },
];

const socialLinks = [
  {
    href: "https://github.com/suryaelidanto/umkmcepat",
    label: "GitHub",
    icon: Github,
  },
  {
    href: "https://www.linkedin.com/in/cintarasuryaelidanto/",
    label: "LinkedIn",
    icon: Linkedin,
  },
  {
    href: "http://support.umkmcepat.com/",
    label: "Support",
    icon: Coffee,
  },
];

export function Footer() {
  return (
    <footer className="border-t border-[#171412]/10 bg-[#fbfaf8] text-[#171412]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[#f0437d] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbfaf8]"
              aria-label="UMKM Cepat beranda"
            >
              <Image src="/logo.svg" alt="" width={28} height={28} />
              <span className="font-semibold tracking-tight">UMKM Cepat</span>
            </Link>
            <p className="mt-4 text-sm leading-6 text-[#171412]/60">
              AI landing page builder open-source untuk membantu UMKM membuat halaman promosi yang rapi dan cepat dibagikan.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-[#171412]/62" aria-label="Navigasi footer">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="transition-colors hover:text-[#171412] focus-visible:text-[#171412] focus-visible:outline-none">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-4 border-t border-[#171412]/10 pt-6 text-sm text-[#171412]/55 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} UMKM Cepat. Built for umkmcepat.com.</p>
          <div className="flex flex-wrap gap-3">
            {socialLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-[#171412]/10 bg-white/70 px-3 py-2 text-[#171412]/65 transition-colors hover:bg-white hover:text-[#171412] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0437d] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbfaf8]"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </footer>
  );
}

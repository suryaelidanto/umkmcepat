import { AuthButton } from "@/components/auth/AuthComponents";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mr-4 flex">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <Image src="/logo.svg" alt="Tokko Logo" width={24} height={24} />
            {/* Sembunyikan teks di layar kecil */}
            <span className="font-bold hidden sm:inline-block">
              tokko.online
            </span>
          </Link>
          {/* Optional: Add navigation links here */}
          {/* <nav className="flex items-center gap-6 text-sm">
            <Link
              href="/docs"
              className="transition-colors hover:text-foreground/80 text-foreground/60"
            >
              Docs
            </Link>
          </nav> */}
        </div>
        <div className="flex flex-1 items-center justify-end space-x-2 md:space-x-4">
          {/* Tambah Tombol Buat Halaman */}
          <Button size="sm" asChild>
            <Link href="/create">
              <Sparkles className="h-4 w-4 mr-1.5" /> Buat Halaman
            </Link>
          </Button>

          <AuthButton />
        </div>
      </div>
    </header>
  );
}

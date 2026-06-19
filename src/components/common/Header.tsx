import { Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { AuthButton } from "@/components/auth/AuthComponents";
import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center mx-auto px-2 sm:px-6 lg:px-8">
        <div className="mr-4 flex">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <Image src="/logo.svg" alt="UMKM Cepat Logo" width={24} height={24} />
            {/* Ensure text is hidden by default and shown on sm+ */}
            <span className="font-bold hidden sm:inline-block">
              umkmcepat.com
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
        <div className="flex flex-1 items-center justify-end space-x-2">
          {/* Tambah Tombol Buat Halaman */}
          <Button size="sm" asChild>
            <Link href="/create" className="flex items-center">
              <Sparkles className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Buat Halaman</span>
            </Link>
          </Button>

          <AuthButton />
        </div>
      </div>
    </header>
  );
}

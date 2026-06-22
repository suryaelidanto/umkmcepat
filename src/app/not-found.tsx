import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-warm-white px-4 text-center">
      <AlertTriangle className="mb-6 size-16 text-yellow-600" />
      <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground-primary sm:text-6xl">
        404 - Halaman tidak ditemukan
      </h1>
      <p className="mt-4 max-w-md text-lg leading-8 text-text-secondary">
        URL salah ketik atau halaman ini sudah tidak tersedia.
      </p>
      <div className="mt-10 flex items-center justify-center gap-x-6">
        <Button asChild size="lg">
          <Link href="/">Kembali ke beranda</Link>
        </Button>
      </div>
    </div>
  );
}

import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-surface-warm-white text-center px-4">
      <AlertTriangle className="h-16 w-16 text-yellow-500 mb-6" />
      <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl mb-4">
        404 - Halaman Tidak Ditemukan
      </h1>
      <p className="mt-4 text-lg leading-8 text-slate-600 max-w-md">
        Maaf, halaman yang Anda cari tidak dapat ditemukan. Mungkin URL salah
        ketik atau halaman tersebut sudah tidak ada.
      </p>
      <div className="mt-10 flex items-center justify-center gap-x-6">
        <Button asChild size="lg">
          <Link href="/">Kembali ke Beranda</Link>
        </Button>
        <Button variant="outline" asChild size="lg">
          <Link href="/create">Buat Landing Page Baru</Link>
        </Button>
      </div>
    </div>
  );
}

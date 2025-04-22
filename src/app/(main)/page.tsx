import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="container mx-auto flex max-w-3xl flex-col items-center justify-center px-4 py-16 text-center sm:py-24">
      <Image
        src="/logo.svg"
        alt="Tokko Logo"
        width={48}
        height={48}
        className="mb-6"
      />
      <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">
        Buat Landing Page Profesional{" "}
        <span className="text-primary">Instan</span> dengan AI
      </h1>
      <p className="mt-6 text-lg leading-8 text-slate-600">
        tokko.online membantu UMKM dan siapa saja membuat halaman promosi
        produk/jasa yang efektif dalam hitungan detik. Tanpa login, tanpa ribet,
        cukup jelaskan usahamu.
      </p>
      <div className="mt-10 flex items-center justify-center gap-x-6">
        <Button asChild size="lg">
          <Link href="/create">
            Buat Landing Page GRATIS Sekarang{" "}
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </Button>
        {/* Optional: Link to examples or GitHub */}
        {/* <Button variant="outline" asChild size="lg">
          <Link href="#examples">
            Lihat Contoh
          </Link>
        </Button> */}
      </div>

      {/* Optional: Add sections for How it Works, Features, Examples */}
      {/* <div className="mt-20 w-full">
        <h2 className="text-2xl font-semibold">Cara Kerja</h2>
        {/* ... How it works steps ... */}
      {/* </div> */}
    </div>
  );
}

import { LandingPageCreationForm } from "@/components/landing-page/LandingPageCreationForm";
import { CheckCircle } from "lucide-react";

export default function Home() {
  return (
    <main className="container mx-auto px-4 py-16 md:py-24 max-w-4xl">
      <section className="text-center mb-16 md:mb-20">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight mb-4 text-foreground">
          Buat Landing Page Profesional dengan AI
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
          Hanya butuh beberapa detik! Cukup masukkan info usaha Anda, dan biarkan AI kami merancang landing page yang menarik dan efektif untuk promosi Anda.
        </p>
      </section>

      <section className="mb-24 flex justify-center">
        {/* Render the creation form component */}
        <LandingPageCreationForm />
      </section>

      <section className="text-center">
        <h2 className="text-3xl font-semibold mb-10">Kenapa Pilih tokko.online?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="flex flex-col items-center text-center p-4">
            <CheckCircle className="w-8 h-8 text-primary mb-3" />
            <h3 className="text-lg font-medium mb-1 text-foreground">Konten Cerdas AI</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Dapatkan teks headline, deskripsi, dan call-to-action yang persuasif secara otomatis.
            </p>
          </div>
          {/* Feature 2 */}
          <div className="flex flex-col items-center text-center p-4">
            <CheckCircle className="w-8 h-8 text-primary mb-3" />
            <h3 className="text-lg font-medium mb-1 text-foreground">Mudah & Cepat</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Tidak perlu skill desain atau coding. Langsung jadi dalam hitungan detik.
            </p>
          </div>
          {/* Feature 3 */}
          <div className="flex flex-col items-center text-center p-4">
            <CheckCircle className="w-8 h-8 text-primary mb-3" />
            <h3 className="text-lg font-medium mb-1 text-foreground">Klaim & Kustomisasi</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Klaim halaman Anda, lalu sesuaikan lebih lanjut dengan fitur Tweak AI kami.
            </p>
          </div>
        </div>
      </section>

      {/* Footer (Optional - can be added to layout.tsx instead) */}
      <footer className="text-center mt-24 text-sm text-muted-foreground">
        © {new Date().getFullYear()} tokko.online - Buat landing page cepat pakai AI.
        {/* Add links to privacy/terms if needed here or in main layout */}
      </footer>
    </main>
  );
}

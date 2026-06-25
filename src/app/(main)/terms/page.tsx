export default function TermsPage() {
  return (
    <div className="bg-[#151515] px-4 py-spacing-14 text-surface-warm-white sm:px-spacing-9 lg:px-spacing-10">
      <article className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          Ketentuan penggunaan
        </h1>
        <p className="mt-spacing-5 text-sm leading-6 text-surface-warm-white/62 sm:text-base">
          UMKM Cepat membantu kamu membuat website atau alat digital untuk
          usaha. Gunakan dengan wajar, jujur, dan tidak merugikan orang lain.
        </p>

        <div className="mt-spacing-10 space-y-spacing-8">
          <section>
            <h2 className="text-xl font-semibold">Layanan masih berkembang</h2>
            <p className="mt-spacing-3 text-sm leading-6 text-surface-warm-white/62">
              Hasil dari AI bisa belum sempurna. Periksa ulang isi, harga,
              alamat, nomor kontak, dan klaim usaha sebelum kamu membagikannya
              ke pelanggan.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              Konten yang tidak boleh dibuat
            </h2>
            <p className="mt-spacing-3 text-sm leading-6 text-surface-warm-white/62">
              Jangan gunakan UMKM Cepat untuk perjudian, pornografi, penipuan,
              phishing, barang ilegal, kekerasan, ekstremisme, atau meniru merek
              dan pihak lain tanpa izin.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Akun dan proyek</h2>
            <p className="mt-spacing-3 text-sm leading-6 text-surface-warm-white/62">
              Kamu bertanggung jawab atas isi yang kamu tulis dan website yang
              kamu buat. Kami boleh membatasi akses jika ada penyalahgunaan yang
              membahayakan pengguna lain atau layanan.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Tidak ada jaminan bisnis</h2>
            <p className="mt-spacing-3 text-sm leading-6 text-surface-warm-white/62">
              UMKM Cepat membantu proses pembuatan. Kami tidak menjamin omzet,
              penjualan, peringkat pencarian, atau hasil bisnis tertentu.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Perubahan layanan</h2>
            <p className="mt-spacing-3 text-sm leading-6 text-surface-warm-white/62">
              Fitur dapat berubah karena produk masih aktif dikembangkan. Jika
              ada perubahan penting, kami akan berusaha membuatnya jelas di
              produk atau repositori.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              Ketersediaan dan dukungan biaya
            </h2>
            <p className="mt-spacing-3 text-sm leading-6 text-surface-warm-white/62">
              UMKM Cepat tidak dijamin selalu tersedia atau terus berjalan.
              Layanan gratis ini bergantung pada biaya server, kuota AI, dan
              dukungan sponsor atau donasi; jika layanan ini membantu bisnismu,
              dukunganmu bisa ikut menjaga UMKM Cepat tetap hidup.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Masukan dan kontribusi</h2>
            <p className="mt-spacing-3 text-sm leading-6 text-surface-warm-white/62">
              UMKM Cepat adalah proyek open source. Kamu bisa membuat issue,
              mengusulkan fitur, atau mengirim pull request lewat Github.
              Maintainer akan meninjau dan menerima perubahan yang masuk akal
              untuk produk dan pengguna.
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}

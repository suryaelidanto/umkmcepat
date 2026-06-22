export default function PrivacyPage() {
  return (
    <div className="bg-[#151515] px-4 py-spacing-14 text-surface-warm-white sm:px-spacing-9 lg:px-spacing-10">
      <article className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          Kebijakan privasi
        </h1>
        <p className="mt-spacing-5 text-sm leading-6 text-surface-warm-white/62 sm:text-base">
          Kami mengumpulkan data seperlunya agar kamu bisa masuk, menyimpan
          proyek, dan membuat website dengan bantuan AI.
        </p>

        <div className="mt-spacing-10 space-y-spacing-8">
          <section>
            <h2 className="text-xl font-semibold">Data yang kami simpan</h2>
            <p className="mt-spacing-3 text-sm leading-6 text-surface-warm-white/62">
              Saat kamu masuk, kami menyimpan data akun dasar dari Google
              seperti nama, email, dan foto profil. Kami juga menyimpan proyek,
              chat awal, model AI yang dipakai, dan waktu perubahan proyek.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Data yang dikirim ke AI</h2>
            <p className="mt-spacing-3 text-sm leading-6 text-surface-warm-white/62">
              Teks yang kamu tulis dapat dikirim ke penyedia AI untuk memeriksa
              keamanan dan membuat hasil website. Jangan tulis password, data
              kartu, dokumen pribadi, atau rahasia usaha.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Untuk apa data dipakai</h2>
            <p className="mt-spacing-3 text-sm leading-6 text-surface-warm-white/62">
              Data dipakai untuk login, menyimpan proyek, menjalankan AI,
              menjaga layanan dari penyalahgunaan, dan memperbaiki produk.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Pihak ketiga</h2>
            <p className="mt-spacing-3 text-sm leading-6 text-surface-warm-white/62">
              UMKM Cepat memakai layanan seperti Google untuk login, database
              untuk penyimpanan, dan penyedia AI untuk memproses permintaan.
              Setiap layanan punya kebijakan privasinya sendiri.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Prinsip kami</h2>
            <p className="mt-spacing-3 text-sm leading-6 text-surface-warm-white/62">
              Kami ingin layanan ini berguna untuk usaha kecil tanpa merugikan
              pengguna atau pengelola layanan. Karena itu, kami mengambil data
              seperlunya, menjaga akses sewajarnya, dan membatasi penggunaan
              yang membahayakan orang lain.
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}

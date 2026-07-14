export type LegalDocumentKey = "terms" | "privacy";

export type LegalDocument = {
  intro: string;
  sections: Array<{
    body: string;
    title: string;
  }>;
  title: string;
};

export const legalDocuments = {
  terms: {
    title: "Ketentuan penggunaan",
    intro:
      "UMKM Cepat membantu kamu membuat website atau alat digital untuk usaha. Gunakan dengan wajar, jujur, dan tidak merugikan orang lain.",
    sections: [
      {
        title: "Layanan masih berkembang",
        body: "Hasil dari AI bisa belum sempurna. Periksa ulang isi, harga, alamat, nomor kontak, dan klaim usaha sebelum kamu membagikannya ke pelanggan.",
      },
      {
        title: "Konten yang tidak boleh dibuat",
        body: "Jangan gunakan UMKM Cepat untuk perjudian, pornografi, penipuan, phishing, barang ilegal, kekerasan, ekstremisme, atau meniru merek dan pihak lain tanpa izin.",
      },
      {
        title: "Akun dan proyek",
        body: "Kamu bertanggung jawab atas isi yang kamu tulis dan website yang kamu buat. Kami boleh membatasi akses jika ada penyalahgunaan yang membahayakan pengguna lain atau layanan.",
      },
      {
        title: "Bot, spam, dan penyalahgunaan",
        body: "Jangan memakai bot, script, atau otomatisasi berlebihan untuk membuat spam, mengganggu sistem, membebani layanan, atau menyalahgunakan kuota AI. Kami dapat membatasi, menolak, atau menghentikan akses jika penggunaan membahayakan layanan atau pengguna lain.",
      },
      {
        title: "Tidak ada jaminan bisnis",
        body: "UMKM Cepat membantu proses pembuatan. Kami tidak menjamin omzet, penjualan, peringkat pencarian, atau hasil bisnis tertentu.",
      },
      {
        title: "Perubahan layanan",
        body: "Fitur dapat berubah karena produk masih aktif dikembangkan. Jika ada perubahan penting, kami akan berusaha membuatnya jelas di produk atau repositori.",
      },
      {
        title: "Ketersediaan dan dukungan biaya",
        body: "UMKM Cepat tidak dijamin selalu tersedia atau terus berjalan. Layanan gratis ini bergantung pada biaya server, kuota AI, dan dukungan sponsor atau donasi; jika layanan ini membantu bisnismu, dukunganmu bisa ikut menjaga UMKM Cepat tetap hidup.",
      },
      {
        title: "Masukan dan kontribusi",
        body: "UMKM Cepat adalah proyek open source. Kamu bisa membuat issue, mengusulkan fitur, atau mengirim pull request lewat Github. Maintainer akan meninjau dan menerima perubahan yang masuk akal untuk produk dan pengguna.",
      },
    ],
  },
  privacy: {
    title: "Kebijakan privasi",
    intro:
      "Kami mengumpulkan data seperlunya agar kamu bisa masuk, menyimpan proyek, dan membuat website dengan bantuan AI.",
    sections: [
      {
        title: "Data yang kami simpan",
        body: "Saat kamu masuk, kami menyimpan data akun dasar dari Google seperti nama, email, dan foto profil. Kami juga menyimpan proyek, chat awal, model AI yang dipakai, dan waktu perubahan proyek.",
      },
      {
        title: "Data yang dikirim ke AI",
        body: "Teks yang kamu tulis dapat dikirim ke penyedia AI untuk memeriksa keamanan dan membuat hasil website. Jangan tulis password, data kartu, dokumen pribadi, atau rahasia usaha.",
      },
      {
        title: "Untuk apa data dipakai",
        body: "Data dipakai untuk login, menyimpan proyek, menjalankan AI, menjaga layanan dari penyalahgunaan, dan memperbaiki produk. Untuk memantau keandalan AI, kami dapat mencatat model, jumlah token, waktu proses, dan status teknis tanpa mengirim isi chat atau hasil AI mentah ke sistem observability.",
      },
      {
        title: "Pihak ketiga",
        body: "UMKM Cepat memakai layanan seperti Google untuk login, database untuk penyimpanan, dan penyedia AI untuk memproses permintaan. Setiap layanan punya kebijakan privasinya sendiri.",
      },
      {
        title: "Prinsip kami",
        body: "Kami ingin layanan ini berguna untuk usaha kecil tanpa merugikan pengguna atau pengelola layanan. Karena itu, kami mengambil data seperlunya, menjaga akses sewajarnya, dan membatasi penggunaan yang membahayakan orang lain.",
      },
    ],
  },
} satisfies Record<LegalDocumentKey, LegalDocument>;

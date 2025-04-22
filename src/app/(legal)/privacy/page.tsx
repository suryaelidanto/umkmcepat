import type { Metadata } from "next";

// Fungsi untuk mendapatkan tanggal hari ini dalam format YYYY-MM-DD
const getCurrentDate = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const metadata: Metadata = {
  title: "Privacy Policy | tokko.online",
  robots: { index: false, follow: false }, // Generally no need to index legal pages
};

export default function PrivacyPolicyPage() {
  const today = getCurrentDate();

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold mb-6">
        Kebijakan Privasi tokko.online
      </h1>
      <div className="prose prose-slate max-w-none">
        <p className="text-sm text-muted-foreground">
          Terakhir diperbarui: {today}
        </p>

        <h2>Pendahuluan</h2>
        <p>
          Selamat datang di tokko.online (&quot;Layanan&quot;). Kami menghargai privasi
          Anda dan berkomitmen untuk melindunginya. Kebijakan Privasi ini
          menjelaskan bagaimana kami (&quot;tokko.online&quot;, &quot;kami&quot;) mengumpulkan,
          menggunakan, dan melindungi informasi Anda saat Anda mengunjungi situs
          web kami di https://tokko.online (dan subdomainnya).
        </p>
        <p>
          Dengan menggunakan Layanan kami, Anda menyetujui pengumpulan dan
          penggunaan informasi sesuai dengan kebijakan ini.
        </p>

        {/* ====================================================================== */}
        {/* =================== PENTING: ISI KONTEN DI BAWAH INI =================== */}
        {/* ====================================================================== */}

        <h2>Informasi yang Kami Kumpulkan</h2>
        <p>
          Kami mengumpulkan beberapa jenis informasi untuk berbagai tujuan guna
          menyediakan dan meningkatkan Layanan kami kepada Anda:
        </p>
        <ul>
          <li>
            <strong>Data Akun (via Google Login):</strong> Saat Anda mengklaim
            halaman atau menggunakan fitur yang memerlukan login, kami
            menggunakan Google Login. Kami akan menerima informasi profil dasar
            dari Google, seperti nama, alamat email, dan URL gambar profil Anda,
            sesuai dengan izin yang Anda berikan kepada Google.
          </li>
          <li>
            <strong>Data Input Pengguna:</strong> Saat Anda membuat landing
            page, kami mengumpulkan informasi yang Anda berikan, seperti nama
            usaha, kategori usaha, deskripsi opsional, gambar yang Anda unggah,
            dan nomor WhatsApp (jika diberikan).
          </li>
          <li>
            <strong>Data Landing Page:</strong> Kami menyimpan konten yang
            dihasilkan AI (teks, warna, dll.), slug halaman, URL gambar yang
            diunggah (via Cloudinary), status klaim, ID pengguna yang mengklaim,
            dan jumlah sisa tweak AI.
          </li>
          <li>
            <strong>Data Teknis/Penggunaan (Otomatis):</strong> Kami dapat
            secara otomatis mengumpulkan informasi tertentu saat Anda mengakses
            Layanan, seperti alamat IP (anonim atau sebagian), jenis browser,
            halaman yang dikunjungi, dan waktu akses. Ini membantu kami memahami
            bagaimana Layanan digunakan dan untuk tujuan keamanan (misalnya,
            rate limiting). Kami menggunakan penyedia layanan seperti Vercel
            (hosting) dan Upstash (rate limiting) yang mungkin juga mengumpulkan
            data teknis ini.
          </li>
        </ul>

        <h2>Bagaimana Kami Menggunakan Informasi Anda</h2>
        <p>Kami menggunakan informasi yang dikumpulkan untuk:</p>
        <ul>
          <li>Menyediakan, mengoperasikan, dan memelihara Layanan kami.</li>
          <li>
            Memproses pembuatan landing page Anda, termasuk interaksi dengan API
            OpenAI untuk menghasilkan konten.
          </li>
          <li>
            Mengelola akun Anda jika Anda mengklaim halaman, termasuk
            memverifikasi kepemilikan dan mengelola fitur tweak AI.
          </li>
          <li>Mengunggah dan menyimpan gambar Anda menggunakan Cloudinary.</li>
          <li>
            Menerapkan rate limiting untuk mencegah penyalahgunaan menggunakan
            Upstash Redis.
          </li>
          <li>
            Memantau penggunaan Layanan untuk analisis dan peningkatan
            (misalnya, melalui log Vercel atau Sentry jika diaktifkan).
          </li>
          <li>Melindungi keamanan dan integritas Layanan.</li>
          <li>Mematuhi kewajiban hukum.</li>
        </ul>

        <h2>Berbagi Informasi Anda</h2>
        <p>
          Kami tidak menjual informasi pribadi Anda. Kami dapat membagikan
          informasi Anda dalam situasi berikut:
        </p>
        <ul>
          <li>
            <strong>Dengan Penyedia Layanan:</strong> Kami berbagi informasi
            dengan vendor pihak ketiga yang membantu kami menjalankan Layanan,
            seperti: Vercel (Hosting), Neon (Database), Cloudinary (Penyimpanan
            Gambar), OpenAI (Pemrosesan AI), Google (Autentikasi), Upstash (Rate
            Limiting), dan Sentry (Pemantauan Error, jika diaktifkan). Penyedia
            ini hanya memiliki akses ke informasi yang diperlukan untuk
            melakukan tugas mereka dan diwajibkan untuk melindunginya.
          </li>
          <li>
            **Untuk Kepatuhan Hukum:** Jika diwajibkan oleh hukum atau sebagai
            tanggapan atas permintaan yang valid oleh otoritas publik.
          </li>
        </ul>
        <p>
          Konten landing page yang Anda buat (kecuali token edit sebelum
          diklaim) bersifat publik dan dapat diakses oleh siapa saja melalui URL
          slug uniknya.
        </p>

        <h2>Keamanan Informasi Anda</h2>
        <p>
          Kami mengambil langkah-langkah keamanan yang wajar (teknis dan
          organisasional) untuk melindungi informasi Anda. Namun, tidak ada
          metode transmisi melalui internet atau penyimpanan elektronik yang
          100% aman. Token edit halaman di-hash sebelum disimpan. Setelah
          halaman diklaim, token edit akan dihapus.
        </p>

        <h2>Penyimpanan Data</h2>
        <p>
          Kami menyimpan data Anda selama diperlukan untuk menyediakan Layanan
          atau sebagaimana diwajibkan oleh hukum. Data landing page dan akun
          pengguna disimpan di database Neon (PostgreSQL). Gambar disimpan di
          Cloudinary.
        </p>

        <h2>Hak Anda</h2>
        <p>
          Bergantung pada lokasi Anda, Anda mungkin memiliki hak tertentu
          terkait data pribadi Anda (misalnya, hak akses, perbaikan,
          penghapusan). Silakan hubungi kami jika Anda memiliki permintaan
          terkait data Anda. Anda dapat mengelola informasi profil Google Anda
          melalui pengaturan akun Google Anda.
        </p>

        <h2>Privasi Anak</h2>
        <p>
          Layanan kami tidak ditujukan untuk siapa pun yang berusia di bawah 13
          tahun. Kami tidak secara sadar mengumpulkan informasi identifikasi
          pribadi dari anak di bawah 13 tahun.
        </p>

        <h2>Perubahan Kebijakan Privasi</h2>
        <p>
          Kami dapat memperbarui Kebijakan Privasi ini dari waktu ke waktu. Kami
          akan memberi tahu Anda tentang perubahan apa pun dengan memposting
          Kebijakan Privasi baru di halaman ini dan memperbarui tanggal
          &quot;Terakhir diperbarui&quot;.
        </p>

        <h2>Hubungi Kami</h2>
        <p>
          Jika Anda memiliki pertanyaan tentang Kebijakan Privasi ini, silakan
          hubungi kami melalui email:
          <a href="mailto:my.tokko.online@gmail.com">
            my.tokko.online@gmail.com
          </a>
        </p>
        <hr />
        <p className="text-xs text-muted-foreground">
          *Disclaimer: Kebijakan Privasi ini disediakan sebagai contoh umum dan
          mungkin tidak mencakup semua aspek atau persyaratan hukum yang
          berlaku. Sangat disarankan untuk berkonsultasi dengan penasihat hukum
          untuk memastikan kepatuhan penuh.*
        </p>

        {/* ====================================================================== */}
        {/* =================== AKHIR BAGIAN YANG PERLU DIISI ==================== */}
        {/* ====================================================================== */}
      </div>
    </div>
  );
}

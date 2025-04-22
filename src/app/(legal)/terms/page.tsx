import type { Metadata } from 'next';

// Fungsi untuk mendapatkan tanggal hari ini dalam format YYYY-MM-DD
const getCurrentDate = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const metadata: Metadata = {
  title: 'Terms of Service | tokko.online',
  robots: { index: false, follow: false },
};

export default function TermsOfServicePage() {
    const today = getCurrentDate();

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold mb-6">Syarat dan Ketentuan Penggunaan tokko.online</h1>
      <div className="prose prose-slate max-w-none">
        <p className="text-sm text-muted-foreground">Terakhir diperbarui: {today}</p>

        <h2>1. Penerimaan Persyaratan</h2>
        <p>
          Selamat datang di tokko.online (&quot;Layanan&quot;). Syarat dan Ketentuan Penggunaan (&quot;Persyaratan&quot;) ini mengatur akses Anda ke dan penggunaan Layanan kami.
          Dengan mengakses atau menggunakan Layanan, Anda setuju untuk terikat oleh Persyaratan ini. Jika Anda tidak setuju, jangan gunakan Layanan.
        </p>

        <h2>2. Deskripsi Layanan</h2>
        <p>
          tokko.online adalah platform AI Landing Page Generator. Kami memungkinkan pengguna membuat halaman arahan promosi dengan bantuan AI.
          Layanan disediakan &quot;sebagaimana adanya&quot; tanpa jaminan apa pun.
        </p>

        <h2>3. Penggunaan yang Diizinkan dan Pembatasan</h2>
        <p>Anda setuju untuk menggunakan Layanan hanya untuk tujuan yang sah dan sesuai dengan Persyaratan ini. Anda setuju untuk tidak:</p>
        <ul>
            <li>Menggunakan Layanan dengan cara apa pun yang melanggar hukum atau peraturan yang berlaku.</li>
            <li>Mengunggah atau menyebarkan konten yang ilegal, berbahaya, memfitnah, cabul, melanggar hak kekayaan intelektual, atau tidak pantas.</li>
            <li>Mencoba mendapatkan akses tidak sah ke, mengganggu, merusak, atau mengacaukan bagian mana pun dari Layanan, server, atau jaringan yang terhubung.</li>
            <li>Menggunakan AI dengan cara yang melanggar kebijakan penggunaan OpenAI.</li>
            <li>Menyalahgunakan fitur tweak AI.</li>
             <li>Menggunakan Layanan dengan cara yang dapat menonaktifkan, membebani secara berlebihan, merusak, atau mengganggu situs atau mengganggu penggunaan pihak lain atas Layanan.</li>
        </ul>
        <p>Anda bertanggung jawab penuh atas semua konten yang Anda buat dan aktivitas yang terjadi di bawah akun Anda (jika ada).</p>

         <h2>4. Kepemilikan Halaman, Klaim, dan Konten</h2>
        <ul>
            <li>Halaman yang Anda buat awalnya bersifat publik dan dapat diedit oleh siapa saja yang memiliki token edit unik. Anda bertanggung jawab untuk menjaga kerahasiaan token ini jika Anda tidak segera mengklaim halaman tersebut.</li>
            <li>Anda dapat mengklaim kepemilikan halaman secara permanen menggunakan akun Google Anda. Setelah diklaim, token edit dihapus, dan hanya Anda (pemilik akun) yang dapat mengedit atau men-tweak halaman tersebut.</li>
            <li>Anda mempertahankan kepemilikan atas konten asli yang Anda berikan (misalnya, deskripsi awal, gambar yang diunggah).</li>
             <li>Konten yang dihasilkan oleh AI tunduk pada lisensi dan ketentuan dari OpenAI. tokko.online tidak mengklaim kepemilikan atas konten yang dihasilkan AI untuk Anda.</li>
             <li>Dengan mengunggah gambar, Anda menyatakan bahwa Anda memiliki hak untuk melakukannya dan memberikan kami lisensi untuk menyimpan dan menampilkannya sebagai bagian dari landing page Anda.</li>
        </ul>

        <h2>5. Ketersediaan Layanan dan Modifikasi</h2>
        <p>
           Kami berhak untuk menarik atau mengubah Layanan kami, dan materi apa pun yang kami sediakan di Layanan, atas kebijakan kami sendiri tanpa pemberitahuan. Kami tidak akan bertanggung jawab jika karena alasan apa pun semua atau sebagian dari Layanan tidak tersedia kapan saja atau untuk periode apa pun.
        </p>

        <h2>6. Penafian Jaminan</h2>
        <p>
            Layanan disediakan &quot;SEBAGAIMANA ADANYA&quot; dan &quot;SEBAGAIMANA TERSEDIA&quot; tanpa jaminan apa pun, baik tersurat maupun tersirat, termasuk namun tidak terbatas pada jaminan tersirat tentang kelayakan jual, kesesuaian untuk tujuan tertentu, atau non-pelanggaran.
            Kami tidak menjamin bahwa konten yang dihasilkan AI akan akurat, lengkap, atau sesuai untuk tujuan Anda.
        </p>

        <h2>7. Pembatasan Tanggung Jawab</h2>
        <p>
            Dalam batas maksimal yang diizinkan oleh hukum yang berlaku, dalam keadaan apa pun tokko.online, afiliasinya, atau pemberi lisensinya, penyedia layanan, karyawan, agen, pejabat, atau direkturnya tidak akan bertanggung jawab atas kerusakan dalam bentuk apa pun, berdasarkan teori hukum apa pun, yang timbul dari atau sehubungan dengan penggunaan Anda, atau ketidakmampuan untuk menggunakan, Layanan, situs web apa pun yang tertaut dengannya, konten apa pun di Layanan atau situs web lain semacam itu, termasuk kerusakan langsung, tidak langsung, khusus, insidental, konsekuensial, atau hukuman.
        </p>

         <h2>8. Perubahan Persyaratan</h2>
        <p>
            Kami dapat merevisi dan memperbarui Persyaratan ini dari waktu ke waktu atas kebijakan kami sendiri. Semua perubahan berlaku segera saat kami mempostingnya. Penggunaan Layanan oleh Anda setelah posting Persyaratan yang direvisi berarti Anda menerima dan menyetujui perubahan tersebut.
        </p>

        <h2>9. Hukum yang Mengatur dan Yurisdiksi</h2>
        <p>
           Semua hal yang berkaitan dengan Layanan dan Persyaratan ini akan diatur oleh dan ditafsirkan sesuai dengan hukum internal Negara Republik Indonesia, tanpa memberlakukan ketentuan atau aturan pilihan atau konflik hukum apa pun.
        </p>

        <h2>10. Hubungi Kami</h2>
        <p>
            Jika Anda memiliki pertanyaan tentang Syarat dan Ketentuan ini, silakan hubungi kami melalui email:
            <a href="mailto:my.tokko.online@gmail.com">my.tokko.online@gmail.com</a>
        </p>
        <hr/>
        <p className="text-xs text-muted-foreground">
            *Disclaimer: Syarat dan Ketentuan ini disediakan sebagai contoh umum dan mungkin tidak mencakup semua aspek atau persyaratan hukum yang berlaku. Sangat disarankan untuk berkonsultasi dengan penasihat hukum untuk memastikan kepatuhan penuh.*
        </p>
      </div>
    </div>
  );
} 
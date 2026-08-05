#!/usr/bin/env bash
# Run E2E for 10 different business-type variants.
# Each variant writes a JSON brief, then invokes e2e-build-smoke.sh.

set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BRIEFS_DIR="$PROJECT_DIR/.data/tmp/briefs"
mkdir -p "$BRIEFS_DIR"

write_brief() {
  local name="$1"
  local json="$2"
  local keywords="$3"
  echo "$json" > "$BRIEFS_DIR/$name.json"
  echo "$keywords" > "$BRIEFS_DIR/$name.keywords"
}

# Helper: build a brief JSON with sensible defaults.
mk_brief() {
  local prompt="$1" businessName="$2" businessType="$3" offer="$4" \
        contactOrCta="$5" targetCustomer="$6" priceRange="$7" \
        deliveryArea="$8" address="$9" paymentMethods="${10}" \
        productName="${11}" productDesc="${12}"
  cat <<JSON
{
  "version": 1,
  "prompt": "$prompt",
  "facts": [],
  "notes": [],
  "offer": "$offer",
  "since": null,
  "address": "$address",
  "contact": {"channel":"whatsapp","value":"081234567890","label":"WhatsApp"},
  "tagline": null,
  "visuals": null,
  "decisions": [],
  "confidence": 95,
  "priceRange": "$priceRange",
  "socialLinks": null,
  "businessName": "$businessName",
  "businessType": "$businessType",
  "contactOrCta": "$contactOrCta",
  "currentPromo": null,
  "deliveryArea": "$deliveryArea",
  "secondaryCta": null,
  "testimonials": null,
  "openQuestions": [],
  "readyForBuild": true,
  "certifications": null,
  "paymentMethods": $paymentMethods,
  "productOrService": [{"name":"$productName","description":"$productDesc","priceRange":"$priceRange","isPrimary":true}],
  "targetCustomer": "$targetCustomer"
}
JSON
}

# 1) F&B — katering
write_brief "01-catering" \
  "$(mk_brief 'jualan katering nasi kotak Solo' 'Dapur Bu Ani' 'fnb' 'Nasi kotak harian' 'WhatsApp 08123' 'anak sekolah dan kantor' 'Rp 15.000-25.000' 'Solo Raya' 'Jl. Slamet Riyadi 12 Solo' '["transfer","qris"]' 'Nasi Kotak Harian' 'Lauk lengkap, sayur, buah')" \
  "Dapur katering Nasi sekolah Solo WhatsApp"

# 2) Jasa lokal — laundry
write_brief "02-laundry" \
  "$(mk_brief 'layanan laundry kiloan Solo' 'Laundry Bersih' 'jasa_lokal' 'Cuci kiloan + setrika' 'WhatsApp 08123' 'mahasiswa dan pekerja kantor' 'Rp 7.000-15.000/kg' 'Solo' 'Jl. Ahmad Yani 45 Solo' '["cash","qris"]' 'Cuci Kiloan' 'Selesai 24 jam, pewangi premium')" \
  "Laundry Bersih Cuci Kiloan setrika Solo WhatsApp"

# 3) Jasa online — freelance design
write_brief "03-design" \
  "$(mk_brief 'jasa desain grafis freelance' 'Studio Kreasi' 'jasa_online' 'Desain logo, branding, social media' 'Email studio@kreasi.id' 'UMKM dan startup Indonesia' 'Rp 500.000-5.000.000' 'Online (seluruh Indonesia)' 'Online' '["transfer","e-wallet"]' 'Paket Branding' 'Logo + kartu nama + template Instagram')" \
  "Studio Kreasi Desain logo branding Online WhatsApp"

# 4) Kursus — les
write_brief "04-les" \
  "$(mk_brief 'les matematika dan IPA SD' 'Bimbel Cendekia' 'kursus' 'Les privat matematika dan IPA SD' 'WhatsApp 08123' 'siswa SD kelas 4-6' 'Rp 100.000-200.000/sesi' 'Solo dan Sragen' 'Jl. Sudirman 78 Solo' '["transfer","cash"]' 'Les Privat SD' 'Sesi 90 menit, tutor alumni ITB')" \
  "Bimbel Cendekia Les matematika IPA SD Solo WhatsApp"

# 5) Retail — toko kelontong
write_brief "05-kelontong" \
  "$(mk_brief 'toko kelontong sembako' 'Toko Sumber Rezeki' 'retail' 'Sembako, snacks, minuman' 'WhatsApp 08123' 'warga sekitar' 'Beragam' 'Solo' 'Jl. Veteran 22 Solo' '["cash","qris"]' 'Sembako Harian' 'Beras, minyak, telur, gula, snacks')" \
  "Toko Sumber Rezeki Sembako snacks Solo WhatsApp"

# 6) Jasa lokal — barbershop
write_brief "06-barbershop" \
  "$(mk_brief 'barbershop pria modern' 'Pangkas Premium' 'jasa_lokal' 'Haircut, shave, beard trim' 'WhatsApp 08123' 'pria 18-45 tahun' 'Rp 35.000-75.000' 'Solo' 'Jl. Honggowongso 8 Solo' '["cash","qris"]' 'Haircut Premium' 'Cuci rambut, potong, styling, hot towel')" \
  "Pangkas Premium Barbershop Haircut Solo WhatsApp"

# 7) F&B — kafe
write_brief "07-kafe" \
  "$(mk_brief 'kafe specialty coffee Solo' 'Kopi Janji' 'fnb' 'Kopi specialty, pastry, light meal' 'WhatsApp 08123' 'mahasiswa dan profesional muda' 'Rp 18.000-45.000' 'Solo' 'Jl. Diponegoro 50 Solo' '["cash","qris","e-wallet"]' 'Kopi Janji Signature' 'Manual brew, single origin Indonesia')" \
  "Kopi Janji Kafe specialty Solo WhatsApp"

# 8) F&B — bakery
write_brief "08-bakery" \
  "$(mk_brief 'toko roti dan pastry' 'Roti Hangat' 'fnb' 'Roti manis, pastry, kue tradisional' 'WhatsApp 08123' 'keluarga dan event organizer' 'Rp 8.000-150.000' 'Solo' 'Jl. Gatot Subroto 30 Solo' '["cash","transfer"]' 'Roti Manis Harian' 'Coklat, keju, srikaya, pizza bread')" \
  "Roti Hangat Bakery pastry Solo WhatsApp"

# 9) Retail — thrift store
write_brief "09-thrift" \
  "$(mk_brief 'toko baju thrift branded' 'Surya Thrift' 'retail' 'Baju bekas branded pria dan wanita' 'WhatsApp 08123' 'mahasiswa dan anak muda' 'Rp 25.000-250.000' 'Solo (bisa kirim)' 'Jl. Solo Baru' '["cash","qris","transfer"]' 'Thrift Branded Mix' 'Kemeja, celana, jaket, dress branded second')" \
  "Surya Thrift baju branded Solo WhatsApp"

# 10) Jasa lokal — salon
write_brief "10-salon" \
  "$(mk_brief 'salon kecantikan wanita' 'Salon Ayu' 'jasa_lokal' 'Haircut, coloring, creambath, nail art' 'WhatsApp 08123' 'wanita 18-55 tahun' 'Rp 50.000-350.000' 'Solo' 'Jl. MT Haryono 88 Solo' '["cash","qris"]' 'Paket Hair Spa' 'Creambath, masker rambut, styling')" \
  "Salon Ayu kecantikan haircut Solo WhatsApp"

echo "10 brief files written to $BRIEFS_DIR"
ls -la "$BRIEFS_DIR"

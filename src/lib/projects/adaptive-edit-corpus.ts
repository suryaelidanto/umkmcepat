export const ADAPTIVE_EDIT_DIMENSIONS = [
  "copy",
  "content",
  "media",
  "style",
  "layout",
] as const;

export type AdaptiveEditDimension = (typeof ADAPTIVE_EDIT_DIMENSIONS)[number];

export type AdaptiveEditScenario = {
  id: string;
  instruction: string;
  dimensions: readonly AdaptiveEditDimension[];
  tags: readonly string[];
};

export const ADAPTIVE_EDIT_SCENARIOS: readonly AdaptiveEditScenario[] = [
  {
    id: "copy-cta-label",
    instruction: "Ubah label tombol utama menjadi Hubungi Kami.",
    dimensions: ["copy"],
    tags: ["copy_only"],
  },
  {
    id: "copy-hero-description",
    instruction:
      "Ringkas deskripsi hero berdasarkan informasi usaha yang sudah ada.",
    dimensions: ["copy", "content"],
    tags: ["copy_only", "grounded_content"],
  },
  {
    id: "content-owner-hours",
    instruction:
      "Tambahkan jam buka yang baru saya berikan ke bagian informasi.",
    dimensions: ["content"],
    tags: ["owner_content"],
  },
  {
    id: "content-service-detail",
    instruction: "Tambahkan detail layanan yang saya tulis ke section layanan.",
    dimensions: ["content"],
    tags: ["owner_content"],
  },
  {
    id: "media-upload-hero",
    instruction: "Pakai foto yang saya unggah sebagai gambar utama website.",
    dimensions: ["media"],
    tags: ["uploaded_photo"],
  },
  {
    id: "media-replace-gallery",
    instruction: "Ganti foto galeri lama dengan foto produk yang saya unggah.",
    dimensions: ["media"],
    tags: ["uploaded_photo"],
  },
  {
    id: "media-remove-obsolete",
    instruction: "Hapus foto yang sudah tidak relevan dari galeri.",
    dimensions: ["media", "content"],
    tags: ["remove_media"],
  },
  {
    id: "style-palette-only",
    instruction:
      "Ubah warna utama menjadi biru tua, jangan ubah layout atau isi.",
    dimensions: ["style"],
    tags: ["palette_only"],
  },
  {
    id: "style-typography",
    instruction: "Buat tipografi lebih tegas tanpa mengubah susunan section.",
    dimensions: ["style"],
    tags: ["typography_only"],
  },
  {
    id: "premium-visual-redesign",
    instruction:
      "Buat website terasa lebih premium dengan hierarki, komposisi, dan responsive layout yang lebih matang.",
    dimensions: ["style", "layout"],
    tags: ["premium_redesign"],
  },
  {
    id: "section-add-faq",
    instruction:
      "Tambahkan section FAQ dari pertanyaan dan jawaban yang saya berikan.",
    dimensions: ["content", "layout"],
    tags: ["add_section", "grounded_content"],
  },
  {
    id: "section-remove-pricing",
    instruction: "Hapus section tarif karena saya tidak ingin menampilkannya.",
    dimensions: ["content", "layout"],
    tags: ["remove_section"],
  },
  {
    id: "layout-reorder-sections",
    instruction: "Pindahkan layanan ke atas dan letakkan kontak setelahnya.",
    dimensions: ["layout"],
    tags: ["reorder_layout"],
  },
  {
    id: "layout-new-hero",
    instruction:
      "Buat layout hero baru dengan fokus yang lebih jelas pada tindakan utama.",
    dimensions: ["layout", "style"],
    tags: ["new_layout"],
  },
  {
    id: "explicit-full-rebuild",
    instruction:
      "Bangun ulang seluruh website dari awal, tetapi pertahankan semua fakta bisnis yang sudah terverifikasi.",
    dimensions: ["copy", "content", "style", "layout"],
    tags: ["explicit_full_rebuild"],
  },
];

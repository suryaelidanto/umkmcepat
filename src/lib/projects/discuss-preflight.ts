import type { BriefQuestion, WorkspaceCard } from "./brief";

export type DiscussPreflight = "build" | "update";

export function isPreflightBlockedByWorkspaceCard(
  card: WorkspaceCard,
): boolean {
  return card.type === "question" || card.type === "image_upload";
}

export function resolvePreflightBuildReadiness({
  hasPendingUpdate,
  preflight,
  readyForBuild,
}: {
  hasPendingUpdate: boolean;
  preflight?: DiscussPreflight;
  readyForBuild: boolean;
}): boolean {
  return preflight === "update" && !hasPendingUpdate ? false : readyForBuild;
}

export function createUpdateIntentQuestion(): Extract<
  WorkspaceCard,
  { type: "question" }
> {
  return {
    type: "question",
    question: {
      answerMode: "choice",
      id: "update_intent",
      options: [
        {
          description: "Warna, tipografi, gaya, atau susunan elemen.",
          label: "Tampilan dan tema",
        },
        {
          description: "Judul, deskripsi, layanan, atau informasi usaha.",
          label: "Teks dan informasi",
        },
        {
          description: "Foto usaha, logo, atau gambar di website.",
          label: "Foto dan media",
        },
        {
          description: "Bagian halaman, navigasi, atau alur pengunjung.",
          label: "Struktur halaman",
        },
        {
          description: "Tombol, kontak, atau perilaku website.",
          label: "Fitur dan tombol",
        },
      ],
      question: "Bagian mana yang ingin kamu ubah?",
      required: true,
      selectionMode: "single",
    } satisfies BriefQuestion,
  };
}

export function ensureUpdatePreflightCard(
  card: WorkspaceCard,
  options: { allowRecommendation?: boolean } = {},
): WorkspaceCard {
  if (card.type === "question") {
    return card;
  }
  if (options.allowRecommendation && card.type === "build_recommendation") {
    return card;
  }
  return createUpdateIntentQuestion();
}

export function getDiscussPreflightInstruction(
  preflight: DiscussPreflight,
  options: {
    hasPendingUpdate?: boolean;
    pendingUpdateInstructions?: string;
  } = {},
): string {
  if (preflight === "update") {
    const pendingContext = options.pendingUpdateInstructions?.trim()
      ? `\nPermintaan pemilik setelah checkpoint:\n${options.pendingUpdateInstructions.trim()}`
      : "";
    return options.hasPendingUpdate
      ? `
PREFLIGHT UPDATE: Pemilik menekan Perbarui website tanpa menulis pesan baru.${pendingContext}
Gunakan permintaan perubahan tersebut untuk menyusun atau mengklarifikasi update. Ini hanya tahap persiapan, bukan menjalankan edit atau build. Jika permintaannya sudah jelas, keluarkan build_recommendation untuk dikonfirmasi user. Sertakan briefPatch yang mencerminkan perubahan pemilik. Jika belum jelas, tanyakan satu hal dengan kartu question dan pilihan konkret. Jangan mengklaim perubahan sudah diterapkan.`
      : `
PREFLIGHT UPDATE: Pemilik menekan Perbarui website tanpa menulis pesan baru.
Ini hanya tahap memahami permintaan, bukan menjalankan edit atau build. Belum ada permintaan perubahan yang jelas setelah checkpoint sukses terakhir, jadi tanyakan satu hal tentang jenis perubahan dengan kartu question dan pilihan yang konkret. Gunakan single select. Jangan mengklaim perubahan sudah diterapkan dan jangan mengeluarkan build_recommendation pada pertanyaan pembuka ini.`;
  }

  return `
PREFLIGHT BUILD: Pemilik menekan Buat website tanpa menulis pesan baru.
Ini hanya tahap pemeriksaan kesiapan, bukan menjalankan build. Tanyakan satu hal yang masih diperlukan dengan kartu question, atau keluarkan build_recommendation hanya jika data dan handoff sudah siap. Kartu rekomendasi adalah konfirmasi user, bukan side effect.`;
}

export function getDiscussPreflightFallbackText(
  preflight: DiscussPreflight,
): string {
  return preflight === "update"
    ? "Kita mulai dari bagian website yang ingin kamu ubah."
    : "Kita cek dulu informasi yang diperlukan sebelum membuat website.";
}

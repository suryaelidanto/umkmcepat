import type {
  DiscussReadiness,
  DiscussReadinessBlocker,
} from "@/lib/projects/discuss-readiness";

import { normalizeWorkspaceTurn } from "@/lib/projects/brief-flow";

const BUILD_NOW_PATTERNS: readonly RegExp[] = [
  /langsung\s+(?:bangun|build|gabung)/i,
  /build\s+(?:aja|sekarang|dulu)/i,
  /udah\s+cukup/i,
  /cukup\s+dulu/i,
  /lanjut\s+build/i,
];

export function requestsImmediateBuild(text: string | undefined): boolean {
  if (!text) {
    return false;
  }
  return BUILD_NOW_PATTERNS.some((pattern) => pattern.test(text));
}

export const READINESS_QUESTION_INTRO =
  "Satu hal lagi yang nentuin struktur situsnya, biar hasilnya pas.";

const READINESS_QUESTIONS: Partial<Record<DiscussReadinessBlocker, string>> = {
  businessName: "Nama usaha kamu apa?",
  productOrService: "Usaha ini jual/layani apa?",
  primaryOffer: "Dari beberapa produk tadi, mana yang paling jadi andalan?",
  targetCustomer: "Siapa pelanggan utama yang paling mau kamu tarik?",
  visualPreference: "Gaya situs yang kamu mau seperti apa?",
  visuals: "Udah punya foto produk, atau aku bikin desain yang fokus teks?",
  contact: "Nomor WhatsApp atau telepon yang bisa dihubungi?",
  address: "Alamat lengkap usaha kamu di mana?",
  hours: "Jam buka dan hari operasionalnya bagaimana?",
  deliveryArea: "Area pengiriman atau layanan kamu sampai mana?",
};

export function demoteToReadinessQuestion(
  workspaceTurn: NonNullable<ReturnType<typeof normalizeWorkspaceTurn>>,
  readiness: Extract<DiscussReadiness, { state: "needs_question" }>,
): NonNullable<ReturnType<typeof normalizeWorkspaceTurn>> {
  const question = READINESS_QUESTIONS[readiness.nextFieldId];
  return {
    ...workspaceTurn,
    readyForBuild: false,
    workspaceCard: {
      type: "question",
      question: {
        id: readiness.nextFieldId,
        question: question ?? READINESS_QUESTION_INTRO,
        answerMode: "text",
        selectionMode: "single",
        options: [],
      },
    },
  };
}

const READINESS_LABELS: Partial<Record<DiscussReadinessBlocker, string>> = {
  businessName: "nama usaha",
  primaryOffer: "produk andalan",
  targetCustomer: "target pelanggan",
  visualPreference: "gaya situs",
  visuals: "foto produk",
  contact: "nomor kontak",
  address: "alamat",
  hours: "jam buka",
  deliveryArea: "area pengiriman",
};

export function buildEarlyBuildWarning(
  blockers: readonly DiscussReadinessBlocker[],
): string {
  const labels = blockers
    .map((blocker) => READINESS_LABELS[blocker])
    .filter((label): label is string => Boolean(label))
    .slice(0, 4);
  const suffix = blockers.length > 4 ? " dan beberapa detail lain" : "";
  const joined = labels.length > 1 ? labels.join(", ") : labels[0];
  return `Oke, aku bangun sekarang. Tanpa ${joined}${suffix}, bagian terkait akan dibuat umum atau dikosongkan dulu — nanti gampang ditambah.`;
}

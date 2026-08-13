import type {
  BuildReadiness,
  BuildReadinessField,
} from "@/lib/projects/build-readiness";

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

export function demoteToReadinessQuestion(
  workspaceTurn: NonNullable<ReturnType<typeof normalizeWorkspaceTurn>>,
  readiness: Extract<BuildReadiness, { state: "blocked" }>,
): NonNullable<ReturnType<typeof normalizeWorkspaceTurn>> {
  return {
    ...workspaceTurn,
    readyForBuild: false,
    workspaceCard: {
      type: "question",
      question: readiness.nextQuestion,
    },
  };
}

const READINESS_LABELS: Partial<Record<BuildReadinessField, string>> = {
  "business.name": "nama usaha",
  offers: "produk atau layanan",
  primaryOffer: "produk andalan",
  audience: "target pelanggan",
  primaryAction: "aksi utama dan kontak",
  visualDirection: "gaya situs",
  assets: "foto produk",
  "content.address": "alamat",
  "content.hours": "jam buka",
  "content.deliveryArea": "area pengiriman",
};

export function buildEarlyBuildWarning(
  blockers: readonly BuildReadinessField[],
): string {
  const labels = blockers
    .map((blocker) => READINESS_LABELS[blocker])
    .filter((label): label is string => Boolean(label))
    .slice(0, 4);
  const suffix = blockers.length > 4 ? " dan beberapa detail lain" : "";
  const joined = labels.length > 1 ? labels.join(", ") : labels[0];
  return `Oke, aku bangun sekarang. Tanpa ${joined}${suffix}, bagian terkait akan dibuat umum atau dikosongkan dulu — nanti gampang ditambah.`;
}

// src/lib/projects/high-risk-claims.ts

export type HighRiskClaimCategory =
  | "contact"
  | "price"
  | "hours"
  | "address"
  | "quantity"
  | "proof"
  | "regulated"
  | "soft_promotion";

export type ClaimMatch = {
  category: HighRiskClaimCategory;
  normalizedValue: string;
  location: { file?: string; selector?: string };
};

const TEL_RE =
  /(?:tel:\+?\d{7,15}|sms:\+?\d{7,15}|wa\.me\/\d{7,15}|whatsapp\.com\/send\?phone=\d{7,15}|mailto:[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|\b(?:\+?62|08)[\d\s\-()]{8,14}\b)/i;
const PRICE_RE =
  /\b(?:Rp|IDR|rupiah)\s*[\d.,]+\b|\b[\d.,]+\s*(?:rb|ribu|jt|juta)\b/i;
const HOURS_RE =
  /\b(?:senin|selasa|rabu|kamis|jumat|sabtu|minggu|buka|tutup|setiap hari)\b[^.\n]{0,20}\b\d{1,2}(?:[:.]\d{2})?\s*[-–—]\s*\d{1,2}(?:[:.]\d{2})?\b/i;
const ADDRESS_RE =
  /\b(?:jalan|jl\.?|jl |no\.?\s|rt\.?\s|rw\.?\s)\s+[A-Za-z0-9]/i;
const QUANTITY_RE =
  /\b\d+\s*(?:porsi|kg|gram|jam|hari|unit|orang|menit|detik|km|m)\b/i;
const PROOF_RE =
  /\b(?:rating|bintang|skor)\s*[:\-]?\s*\d(?:[.,]\d)?\s*[\/5]?\b|\b(?:sejak)\s*\d{4}\b/i;
const REGULATED_RE =
  /\b(?:sertifikat\s+resmi|lisensi\s+resmi|terdaftar\s+bpom|izin\s+pirt|terdaftar\s+bpjs|garansi\s+uang\s+kembali)\b/i;
const SOFT_PROMOTION_RE =
  /\b(?:kualitas|berkualitas|terjangkau|terbaik|termurah|terlaris|favorit)\b|\bberas\s+pilihan\b|\bharga\s+(?:murah|mulai)\b|\b(?:tanpa\s+bahan\s+kimia|langsung\s+dari\s+alam|cocok\s+untuk\s+makan\s+sehari[- ]hari|stok\s+segar|diproses\s+dari\s+mesin\s+giling|(?:diantar|antar(?:kan)?)\s+(?:langsung\s+)?ke\s+rumah|tanpa\s+ongkos\s+tambahan)\b/i;

// Fact-id call patterns resolve through the protected contract module; these
const FACT_REF_RE = /(?:ContractFact|ContractAction|MediaAsset)\s+factId=/g;

function stripFactRefs(source: string): string {
  return source.replace(FACT_REF_RE, "");
}

export function scanSourceClaims(
  source: string,
  location?: { file?: string },
  acceptedValues: string[] = [],
): ClaimMatch[] {
  let cleaned = stripFactRefs(source);
  for (const val of acceptedValues) {
    if (
      val &&
      typeof val === "string" &&
      val.trim().length > 0 &&
      /[a-z0-9]/i.test(val)
    ) {
      cleaned = cleaned.replaceAll(val, " ");
      const digits = val.replace(/\D/g, "");
      if (digits.length >= 7) {
        cleaned = cleaned.replaceAll(digits, " ");
      }
    }
  }
  const matches: ClaimMatch[] = [];
  const addMatch = (category: HighRiskClaimCategory, pattern: RegExp): void => {
    const match = pattern.exec(cleaned);
    if (!match) {
      return;
    }
    matches.push({
      category,
      normalizedValue: match[0],
      location: { ...location },
    });
  };

  addMatch("contact", TEL_RE);
  addMatch("price", PRICE_RE);
  addMatch("hours", HOURS_RE);
  addMatch("address", ADDRESS_RE);
  addMatch("quantity", QUANTITY_RE);
  addMatch("proof", PROOF_RE);
  addMatch("regulated", REGULATED_RE);
  addMatch("soft_promotion", SOFT_PROMOTION_RE);

  return matches;
}

// src/lib/projects/high-risk-claims.ts
// Versioned static matcher for high-risk claims in AI-owned generated source.
// The goal is to block raw literals (phone, price, hours, address, proof,
// regulated claims) outside the protected contract module. It is a finite
// grammar, not a full NLP truth-prover; qualitative non-measurable copy is not
// flagged. High-risk values must resolve through contract primitives instead.

export type HighRiskClaimCategory =
  | "contact"
  | "price"
  | "hours"
  | "address"
  | "quantity"
  | "proof"
  | "regulated";

export type ClaimMatch = {
  category: HighRiskClaimCategory;
  normalizedValue: string;
  location: { file?: string; selector?: string };
};

const TEL_RE =
  /(?:tel:|sms:|wa\.me|whatsapp\.com|mailto:|[+]?[\d][\d\s()\-]{7,15})/i;
const PRICE_RE =
  /\b(?:Rp|IDR|rupiah)\s*[\d.,]+\b|\b[\d.,]+\s*(?:rb|ribu|jt|juta|%)\b/i;
const HOURS_RE =
  /\b(?:senin|selasa|rabu|kamis|jumat|sabtu|minggu|buka|tutup|setiap hari)\b[^.\n]{0,20}\b\d{1,2}(?:[:.]\d{2})?\s*[-–—]\s*\d{1,2}(?:[:.]\d{2})?\b/i;
const ADDRESS_RE =
  /\b(?:jalan|jl\.?|jl |no\.?\s|rt\.?\s|rw\.?\s)\s+[A-Za-z0-9]/i;
const QUANTITY_RE =
  /\b\d+\s*(?:porsi|kg|gram|jam|hari|unit|orang|menit|detik|km|m)\b/i;
const PROOF_RE =
  /\b(?:rating|bintang|skor)\s*[:\-]?\s*\d(?:[.,]\d)?\s*[\/5]?\b|\b(?:tahun)\s*[:\-]?\s*\d+\b|\b(?:sejak)\s*\d{4}\b/i;
const REGULATED_RE =
  /\b(?:sertifikat|lisensi|halal|bpom|pirt|bpjs|jaminan|dijamin|garansi|100%|paling murah|termurah|terbaik)\b/i;

// Fact-id call patterns resolve through the protected contract module; these
// are allowed even if their argument names match a category.
const FACT_REF_RE = /(?:ContractFact|ContractAction|MediaAsset)\s+factId=/g;

function stripFactRefs(source: string): string {
  return source.replace(FACT_REF_RE, "");
}

export function scanSourceClaims(
  source: string,
  location?: { file?: string },
): ClaimMatch[] {
  const cleaned = stripFactRefs(source);
  const matches: ClaimMatch[] = [];

  if (TEL_RE.test(cleaned)) {
    matches.push({
      category: "contact",
      normalizedValue: cleaned,
      location: { ...location },
    });
  }
  if (PRICE_RE.test(cleaned)) {
    matches.push({
      category: "price",
      normalizedValue: cleaned,
      location: { ...location },
    });
  }
  if (HOURS_RE.test(cleaned)) {
    matches.push({
      category: "hours",
      normalizedValue: cleaned,
      location: { ...location },
    });
  }
  if (ADDRESS_RE.test(cleaned)) {
    matches.push({
      category: "address",
      normalizedValue: cleaned,
      location: { ...location },
    });
  }
  if (QUANTITY_RE.test(cleaned)) {
    matches.push({
      category: "quantity",
      normalizedValue: cleaned,
      location: { ...location },
    });
  }
  if (PROOF_RE.test(cleaned)) {
    matches.push({
      category: "proof",
      normalizedValue: cleaned,
      location: { ...location },
    });
  }
  if (REGULATED_RE.test(cleaned)) {
    matches.push({
      category: "regulated",
      normalizedValue: cleaned,
      location: { ...location },
    });
  }

  return matches;
}

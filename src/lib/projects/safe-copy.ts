import { scanSourceClaims } from "./high-risk-claims";

export const SAFE_COPY_CLASSES = [
  "fact_rendering",
  "fact_preserving_polish",
  "navigation",
  "neutral_cta",
  "atmospheric_framing",
  "unsupported_claim",
] as const;

export type SafeCopyClass = (typeof SAFE_COPY_CLASSES)[number];

export type SafeCopyInput = {
  text: string;
  ownerFacts?: readonly string[];
};

const NAVIGATION_RE =
  /^(?:beranda|tentang|produk|layanan|menu|galeri|kontak|lokasi|lihat|cek|buka|kembali|pelajari)\b/i;
const CTA_RE =
  /\b(?:pesan|hubungi|chat|telepon|tanya|booking|reservasi|konsultasi)\b/i;
const ATMOSPHERE_RE =
  /\b(?:suasana|ruang|momen|hangat|tenang|santai|menemani|diracik|disiapkan)\b/i;

export function classifySafeCopy({
  text,
  ownerFacts = [],
}: SafeCopyInput): SafeCopyClass {
  const normalizedText = text.trim().toLocaleLowerCase("id-ID");
  if (!normalizedText) {
    return "unsupported_claim";
  }

  const matchingFacts = ownerFacts.filter((fact) => {
    const normalizedFact = fact.trim().toLocaleLowerCase("id-ID");
    return (
      normalizedFact.length >= 3 && normalizedText.includes(normalizedFact)
    );
  });
  const claims = scanSourceClaims(text, undefined, [...matchingFacts]);
  if (claims.length > 0) {
    return "unsupported_claim";
  }
  if (
    matchingFacts.some(
      (fact) => normalizedText === fact.trim().toLocaleLowerCase("id-ID"),
    )
  ) {
    return "fact_rendering";
  }
  if (matchingFacts.length > 0) {
    return "fact_preserving_polish";
  }
  if (NAVIGATION_RE.test(normalizedText)) {
    return "navigation";
  }
  if (CTA_RE.test(normalizedText)) {
    return "neutral_cta";
  }
  if (ATMOSPHERE_RE.test(normalizedText)) {
    return "atmospheric_framing";
  }
  return "unsupported_claim";
}

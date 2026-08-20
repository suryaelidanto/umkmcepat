// src/lib/projects/edit-structure.ts
export type EditStructureDecision = {
  kind: "non_structural" | "structural";
  reasons: Array<"page_set" | "route_path" | "primary_cta" | "capability">;
};

const STRUCTURAL_PATTERNS: Array<{
  reason: EditStructureDecision["reasons"][number];
  re: RegExp;
}> = [
  {
    reason: "page_set",
    re: /(?:tambah|hapus|buat|remove|add|delete|rename)\s+(?:halaman|page|route|rute)/i,
  },
  { reason: "route_path", re: /\/(?:katalog|tentang|kontak|page|route)\b/i },
  {
    reason: "primary_cta",
    re: /(?:ganti|ubah|change|switch)\s+(?:tombol|cta|aksi).*(?:utama|primary|wa|telepon|call)/i,
  },
  {
    reason: "capability",
    re: /\b(?:checkout|bayar|payment|booking|pesan online)\b/i,
  },
];

export function classifyEditStructure(
  instruction: string,
): EditStructureDecision {
  const text = instruction.trim();
  const reasons = STRUCTURAL_PATTERNS.filter((p) => p.re.test(text)).map(
    (p) => p.reason,
  );
  const kind = reasons.length ? "structural" : "non_structural";
  return { kind, reasons };
}

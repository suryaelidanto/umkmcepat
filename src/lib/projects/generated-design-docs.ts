import type { GeneratedDesignSystemProposalV1 } from "./generated-design-system";
import type { ProjectSiteSchema } from "./site-schema";

export type DesignDirectionInput = {
  thesis: string;
  ownWorld: string;
  story: string;
  firstViewport: string;
  form: string;
  seedKey: string;
  motionThesis: string;
};

export const DESIGN_DOC_HEADERS = [
  "## THESIS",
  "## OWN-WORLD",
  "## STORY",
  "## FIRST VIEWPORT",
  "## MOTION",
] as const;

export const PRODUCT_DOC_PATH = "PRODUCT.md";
export const DESIGN_DOC_PATH = "DESIGN.md";

export function buildProductMarkdown(schema: ProjectSiteSchema): string {
  const facts: string[] = [];
  facts.push(`- Nama usaha: ${schema.businessName}`);
  if (schema.eyebrow) {
    facts.push(`- Kategori: ${schema.eyebrow}`);
  }
  if (schema.offer) {
    facts.push(`- Penawaran: ${schema.offer}`);
  }
  if (schema.audience) {
    facts.push(`- Audiens: ${schema.audience}`);
  }
  if (schema.tagline) {
    facts.push(`- Tagline: ${schema.tagline}`);
  }
  if (schema.priceRange) {
    facts.push(`- Kisaran harga: ${schema.priceRange}`);
  }
  if (schema.address) {
    facts.push(`- Alamat: ${schema.address}`);
  }
  if (schema.deliveryArea) {
    facts.push(`- Area layanan: ${schema.deliveryArea}`);
  }
  if (schema.since) {
    facts.push(`- Berjalan sejak: ${schema.since}`);
  }
  if (schema.contact) {
    facts.push(`- Kontak (${schema.contact.channel}): ${schema.contact.value}`);
  }
  if (schema.primaryCtaTarget) {
    facts.push(`- Aksi utama: ${schema.primaryCta}`);
  }
  for (const product of schema.products ?? []) {
    facts.push(`- Produk/layanan: ${product.name}`);
    if (product.priceRange) {
      facts.push(`  Harga: ${product.priceRange}`);
    }
  }
  for (const hour of schema.hours ?? []) {
    facts.push(`- Jam buka: ${hour.dayRange} ${hour.open}-${hour.close}`);
  }
  for (const point of schema.usp ?? []) {
    facts.push(`- Keunggulan: ${point}`);
  }

  return `# PRODUCT

Dokumen ini adalah daftar fakta usaha yang disetujui pemilik. Semua teks
yang tampil di website wajib bersumber dari daftar ini atau dari
src/content/site.ts.

## Fakta usaha
${facts.join("\n")}

## Batasan klaim
- Jangan menampilkan harga, alamat, jam buka, kontak, atau jumlah yang
  tidak ada di daftar atas.
- Jangan menambahkan penghargaan, statistik, testimoni, atau jaminan
  yang tidak disetujui pemilik.
- Detail yang tidak diketahui: abaikan, jangan mengarang.
`;
}

export function buildDesignMarkdown(input: {
  direction: DesignDirectionInput | null;
  motionOptOut?: boolean;
  system: GeneratedDesignSystemProposalV1 | null;
}): string {
  const direction = input.direction;
  const system = input.system;
  const notSet = "Belum ditetapkan.";

  const palette = system
    ? [
        `- background: ${system.background}`,
        `- foreground: ${system.foreground}`,
        `- muted: ${system.muted} / ${system.mutedForeground}`,
        `- primary: ${system.primary} / ${system.primaryForeground}`,
        `- accent: ${system.accent} / ${system.accentForeground}`,
        `- border: ${system.border}, ring: ${system.ring}`,
      ].join("\n")
    : `- ${notSet}`;

  const type = system
    ? `- display: ${system.displayFontStackId}, body: ${system.bodyFontStackId}\n- radius: ${system.radiusScale}`
    : `- ${notSet}`;

  const motion = input.motionOptOut
    ? "Tanpa animasi atas permintaan eksplisit pemilik. prefers-reduced-motion tetap dihormati."
    : `${direction?.motionThesis ?? notSet}\n- Hormati prefers-reduced-motion; konten tetap terlihat tanpa JavaScript.`;

  return `# DESIGN

Dokumen ini adalah kontrak arah visual website. Iterasi berikutnya wajib
konsisten dengan dunia visual di bawah ini kecuali pemilik meminta
perubahan sistem secara eksplisit.

## THESIS
${direction?.thesis ?? notSet}

## OWN-WORLD
${direction?.ownWorld ?? notSet}

## STORY
${direction?.story ?? notSet}

## FIRST VIEWPORT
${direction?.firstViewport ?? notSet}

## MOTION
${motion}

## PALETTE
${palette}

## TIPOGRAFI & RADIUS
${type}

## FORM
${direction ? `${direction.form} (seed: ${direction.seedKey})` : notSet}
`;
}

export function buildDesignAnchorContext(
  files: ReadonlyArray<{ content: string; path: string }>,
): string {
  const product = files.find((file) => file.path === PRODUCT_DOC_PATH);
  const design = files.find((file) => file.path === DESIGN_DOC_PATH);
  if (!product && !design) {
    return "";
  }
  const sections: string[] = [];
  if (product) {
    sections.push(
      `=== ${PRODUCT_DOC_PATH} (fakta usaha yang disetujui) ===\n${product.content}\n=== AKHIR ${PRODUCT_DOC_PATH} ===`,
    );
  }
  if (design) {
    sections.push(
      `=== ${DESIGN_DOC_PATH} (kontrak arah visual) ===\n${design.content}\n=== AKHIR ${DESIGN_DOC_PATH} ===`,
    );
  }
  sections.push(
    "Pertahankan fakta dan dunia visual di atas. Jangan mengubah palet, tipografi, atau arah desain kecuali permintaan pemilik menunjuknya secara eksplisit.",
  );
  return `\n\nDESIGN & PRODUCT ANCHORS:\n${sections.join("\n\n")}`;
}

export type EditIntentCategory =
  "media_replace" | "style_palette" | "copy_content" | "full_restructure";

export type EditIntentClassification = {
  category: EditIntentCategory;
  confidence: number;
  guidelines: string[];
  suggestedMaxSteps: number;
  targetFiles: string[];
};

const MEDIA_KEYWORDS =
  /\b(?:gambar|foto|photo|image|logo|galeri|gallery|banner|suasana|unggah|upload)\b/i;

const STYLE_KEYWORDS =
  /\b(?:warna|color|tema|theme|palet|palette|gelap|dark|terang|light|monokrom|monochrome|hitam\s+putih|black\s+(?:and|&)\s+white|kontras|contrast|nuansa|mood|font|tipografi|typography)\b/i;

const COPY_KEYWORDS =
  /\b(?:teks|text|copy|tulisan|nama|nomor|no\b|whatsapp|wa\b|telepon|phone|alamat|address|lokasi|location|jam\s+buka|hours|harga|price|tarif|menu|produk|product|layanan|service|slogan|tagline|deskripsi|description|faq|testimoni)\b/i;

const EXPLICIT_COPY_DIRECTIVE_KEYWORDS =
  /\b(?:teks|text|copy|tulisan|label|cta)\b/i;

const FULL_RESTRUCTURE_KEYWORDS =
  /\b(?:rombak\s+total|bikin\s+ulang|buat\s+ulang|redesign\s+total|redesign\s+from\s+scratch|ganti\s+semua|reset\s+semua|rombak\s+semua)\b/i;

export function classifyEditIntent({
  existingFiles = [],
  hasUploadedImages = false,
  instruction,
}: {
  existingFiles?: string[];
  hasUploadedImages?: boolean;
  instruction: string;
}): EditIntentClassification {
  const text = instruction.trim();

  // 1. Explicit full restructure command
  if (FULL_RESTRUCTURE_KEYWORDS.test(text)) {
    return {
      category: "full_restructure",
      confidence: 0.98,
      guidelines: [
        "Perform a comprehensive redesign across sections while preserving verified business facts in site.ts.",
        "Ensure all components follow Impeccable contrast and anti-slop rules.",
      ],
      suggestedMaxSteps: 8,
      targetFiles: existingFiles.filter(
        (f) =>
          f.startsWith("src/components/site/") ||
          f === "src/routes/index.tsx" ||
          f === "src/index.css",
      ),
    };
  }

  // 2. Media replacement (attachments uploaded or media keywords)
  if (
    hasUploadedImages ||
    (MEDIA_KEYWORDS.test(text) && !EXPLICIT_COPY_DIRECTIVE_KEYWORDS.test(text))
  ) {
    const targets = ["src/content/site.ts"];
    const heroFile = existingFiles.find((f) => f.includes("Hero.tsx"));
    if (heroFile) {
      targets.push(heroFile);
    }
    const catalogFile = existingFiles.find(
      (f) =>
        f.includes("Menu") || f.includes("Catalog") || f.includes("Gallery"),
    );
    if (catalogFile && !targets.includes(catalogFile)) {
      targets.push(catalogFile);
    }

    return {
      category: "media_replace",
      confidence: hasUploadedImages ? 0.99 : 0.92,
      guidelines: [
        "Update image references in site.ts and render them using <img src={site.images[...].url} /> in the designated component.",
        "DO NOT modify untouched layout components, headers, footers, or color palettes.",
        "Ensure missing images collapse gracefully without rendering empty gray placeholder boxes.",
      ],
      suggestedMaxSteps: 3,
      targetFiles: targets,
    };
  }

  // 3. Style / Color Palette update
  if (
    STYLE_KEYWORDS.test(text) &&
    !EXPLICIT_COPY_DIRECTIVE_KEYWORDS.test(text)
  ) {
    return {
      category: "style_palette",
      confidence: 0.94,
      guidelines: [
        "Call set_design_system on Step 1 with your chosen semantic OKLCH palette, radius, and typography.",
        "DO NOT rewrite JSX component files unless minor class adjustments are required.",
        "Call check_app immediately to verify contrast and finish.",
      ],
      suggestedMaxSteps: 2,
      targetFiles: ["src/index.css"],
    };
  }

  // 4. Text / Copy content update
  if (COPY_KEYWORDS.test(text)) {
    const targetFiles = ["src/content/site.ts"];
    if (
      /\b(?:tombol|button|label|teks|text|tulisan|cta)\b/i.test(text) &&
      existingFiles.includes("src/routes/index.tsx")
    ) {
      targetFiles.push("src/routes/index.tsx");
    }

    return {
      category: "copy_content",
      confidence: 0.93,
      guidelines: [
        "Update the specific factual fields in src/content/site.ts without changing unrelated content.",
        "Preserve existing component markup and visual hierarchy.",
        "Call check_app immediately after updating site data.",
      ],
      suggestedMaxSteps: 2,
      targetFiles,
    };
  }

  // 5. Default surgical edit
  const relevantComponents = existingFiles.filter(
    (f) => f.startsWith("src/components/site/") || f === "src/routes/index.tsx",
  );

  return {
    category: "copy_content",
    confidence: 0.85,
    guidelines: [
      "Modify ONLY the specific 1-2 files requested by the user.",
      "Preserve all existing working components and styling.",
      "Call check_app as soon as edits are applied to verify compilation.",
    ],
    suggestedMaxSteps: 3,
    targetFiles: relevantComponents.slice(0, 2),
  };
}

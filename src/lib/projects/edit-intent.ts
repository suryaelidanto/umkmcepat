import { z } from "zod";

export const EDIT_INTENT_DIMENSIONS = [
  "copy",
  "content",
  "media",
  "style",
  "layout",
] as const;

export type EditIntentDimension = (typeof EDIT_INTENT_DIMENSIONS)[number];

export const EDIT_INTENT_MAGNITUDES = [
  "surgical",
  "section",
  "structural",
  "full_rebuild",
] as const;

export type EditIntentMagnitude = (typeof EDIT_INTENT_MAGNITUDES)[number];

export const EDIT_INTENT_OPERATIONS = [
  "update_copy",
  "update_content",
  "update_media",
  "update_style",
  "add_section",
  "remove_section",
  "reorder_layout",
  "redesign_layout",
  "full_rebuild",
] as const;

export const editIntentSchema = z.object({
  category: z.enum([
    "media_replace",
    "style_palette",
    "copy_content",
    "layout_restructure",
    "full_restructure",
  ]),
  confidence: z.number().min(0).max(1),
  dimensions: z.array(z.enum(EDIT_INTENT_DIMENSIONS)),
  magnitude: z.enum(EDIT_INTENT_MAGNITUDES),
  allowedOperations: z.array(z.enum(EDIT_INTENT_OPERATIONS)),
  allowsLayout: z.boolean(),
  clarificationRequired: z.boolean(),
  guidelines: z.array(z.string()),
  suggestedMaxSteps: z.number().int().min(0),
  targetFiles: z.array(z.string()),
});

export type EditIntentOperation = (typeof EDIT_INTENT_OPERATIONS)[number];
export type EditIntentClassification = z.infer<typeof editIntentSchema>;

const MEDIA_KEYWORDS =
  /\b(?:gambar|foto|photo|image|logo|galeri|gallery|banner|suasana|unggah|upload)\b/i;

const STYLE_KEYWORDS =
  /\b(?:warna|color|tema|theme|palet|palette|gelap|dark|terang|light|monokrom|monochrome|hitam\s+putih|black\s+(?:and|&)\s+white|kontras|contrast|nuansa|mood|font|tipografi|typography|premium|mewah|elegan|berkelas|modern)\b/i;

const COPY_KEYWORDS =
  /\b(?:teks|text|copy|tulisan|judul|nama|nomor|no\b|whatsapp|wa\b|telepon|phone|alamat|address|lokasi|location|jam\s+buka|hours|harga|price|tarif|menu|produk|product|layanan|service|slogan|tagline|deskripsi|description|faq|testimoni)\b/i;

const EXPLICIT_COPY_DIRECTIVE_KEYWORDS =
  /\b(?:teks|text|copy|tulisan|label|cta)\b/i;

const LAYOUT_KEYWORDS =
  /\b(?:layout|tata\s+letak|susunan|susun|section|bagian|hero|kolom|grid|responsive|responsif|komposisi|struktur|halaman|ruang)\b/i;

const FULL_RESTRUCTURE_KEYWORDS =
  /\b(?:rombak\s+total|bikin\s+ulang|buat\s+ulang|redesign\s+total|redesign\s+from\s+scratch|ganti\s+semua|reset\s+semua|rombak\s+semua|bangun\s+ulang\s+seluruh|dari\s+awal)\b/i;

const PREMIUM_REDESIGN_KEYWORDS =
  /\b(?:lebih\s+premium|premium|lebih\s+mewah|mewah|lebih\s+elegan|elegan|lebih\s+berkelas|naik\s+kelas)\b/i;

const PALETTE_ONLY_KEYWORDS =
  /\b(?:warna|color|palet|palette|gelap|dark|terang|light|monokrom|monochrome|kontras|contrast)\b/i;

const ADD_SECTION_KEYWORDS =
  /\b(?:tambah(?:kan)?|buat)\s+(?:section|bagian|halaman)\b/i;
const REMOVE_SECTION_KEYWORDS =
  /\b(?:hapus|hilangkan|buang)\s+(?:section|bagian|halaman)\b/i;
const REORDER_LAYOUT_KEYWORDS =
  /\b(?:pindah(?:kan)?|urut(?:kan)?|susun ulang|letakkan)\b/i;

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
  const explicitCopy = EXPLICIT_COPY_DIRECTIVE_KEYWORDS.test(text);
  const hasCopy = explicitCopy;
  const hasContent = COPY_KEYWORDS.test(text) && !explicitCopy;
  const mediaInstructionText = stripDeniedMentions(text, MEDIA_KEYWORDS);
  const styleInstructionText = stripDeniedMentions(text, STYLE_KEYWORDS);
  const hasMedia =
    hasUploadedImages ||
    (MEDIA_KEYWORDS.test(mediaInstructionText) && !explicitCopy);
  const hasStyle = STYLE_KEYWORDS.test(styleInstructionText) && !explicitCopy;
  const layoutDenied = hasExplicitLayoutDenial(text);
  const hasLayout =
    LAYOUT_KEYWORDS.test(text) && !explicitCopy && !layoutDenied;
  const explicitFullRebuild = FULL_RESTRUCTURE_KEYWORDS.test(text);
  const explicitPremiumRedesign =
    PREMIUM_REDESIGN_KEYWORDS.test(text) &&
    !PALETTE_ONLY_KEYWORDS.test(text) &&
    !hasExplicitLayoutDenial(text);
  const dimensions = getDimensions({
    hasCopy,
    hasContent,
    hasLayout,
    hasMedia,
    hasStyle,
    explicitPremiumRedesign,
  });

  if (explicitFullRebuild) {
    return createClassification({
      category: "full_restructure",
      confidence: 0.98,
      dimensions: [...EDIT_INTENT_DIMENSIONS],
      magnitude: "full_rebuild",
      allowedOperations: [...EDIT_INTENT_OPERATIONS],
      allowsLayout: true,
      clarificationRequired: false,
      guidelines: [
        "Perform a comprehensive redesign across sections while preserving verified business facts in site.ts.",
        "Ensure all components follow Impeccable contrast and anti-slop rules.",
      ],
      suggestedMaxSteps: 8,
      targetFiles: getPresentationFiles(existingFiles),
    });
  }

  if (dimensions.length === 0) {
    return createClassification({
      category: "copy_content",
      confidence: 0.5,
      dimensions: [],
      magnitude: "surgical",
      allowedOperations: [],
      allowsLayout: false,
      clarificationRequired: true,
      guidelines: [
        "Ask one clarification question about the section, content, or visual direction to change before editing.",
      ],
      suggestedMaxSteps: 0,
      targetFiles: [],
    });
  }

  const addSection = ADD_SECTION_KEYWORDS.test(text);
  const removeSection = REMOVE_SECTION_KEYWORDS.test(text);
  const reorderLayout = REORDER_LAYOUT_KEYWORDS.test(text) && hasLayout;
  const allowedOperations = getAllowedOperations({
    dimensions,
    addSection,
    removeSection,
    reorderLayout,
  });
  const layoutChange = dimensions.includes("layout");
  const magnitude: EditIntentMagnitude = layoutChange
    ? explicitPremiumRedesign || hasBroadLayoutLanguage(text)
      ? "structural"
      : addSection || removeSection || reorderLayout
        ? "section"
        : "structural"
    : "surgical";
  const category = dimensions.includes("layout")
    ? "layout_restructure"
    : dimensions.includes("media")
      ? "media_replace"
      : dimensions.includes("style")
        ? "style_palette"
        : "copy_content";

  return createClassification({
    category,
    confidence: hasUploadedImages ? 0.99 : 0.94,
    dimensions,
    magnitude,
    allowedOperations,
    allowsLayout: layoutChange,
    clarificationRequired: false,
    guidelines: getGuidelines({
      category,
      dimensions,
      magnitude,
    }),
    suggestedMaxSteps: getSuggestedMaxSteps({
      dimensions,
      magnitude,
      hasUploadedImages,
    }),
    targetFiles: getTargetFiles({
      existingFiles,
      dimensions,
      hasCopy,
      hasContent,
      hasMedia,
    }),
  });
}

function createClassification(
  classification: EditIntentClassification,
): EditIntentClassification {
  return editIntentSchema.parse(classification);
}

function getDimensions({
  hasCopy,
  hasContent,
  hasLayout,
  hasMedia,
  hasStyle,
  explicitPremiumRedesign,
}: {
  hasCopy: boolean;
  hasContent: boolean;
  hasLayout: boolean;
  hasMedia: boolean;
  hasStyle: boolean;
  explicitPremiumRedesign: boolean;
}): EditIntentDimension[] {
  const dimensions: EditIntentDimension[] = [];
  if (hasCopy) {
    dimensions.push("copy");
  }
  if (hasContent) {
    dimensions.push("content");
  }
  if (hasMedia) {
    dimensions.push("media");
  }
  if (hasStyle) {
    dimensions.push("style");
  }
  if (hasLayout || explicitPremiumRedesign) {
    dimensions.push("layout");
  }
  return dimensions;
}

function getAllowedOperations({
  dimensions,
  addSection,
  removeSection,
  reorderLayout,
}: {
  dimensions: EditIntentDimension[];
  addSection: boolean;
  removeSection: boolean;
  reorderLayout: boolean;
}): EditIntentOperation[] {
  const operations: EditIntentOperation[] = [];
  if (dimensions.includes("copy")) {
    operations.push("update_copy");
  }
  if (dimensions.includes("content")) {
    operations.push("update_content");
  }
  if (dimensions.includes("media")) {
    operations.push("update_media");
  }
  if (dimensions.includes("style")) {
    operations.push("update_style");
  }
  if (addSection) {
    operations.push("add_section");
  }
  if (removeSection) {
    operations.push("remove_section");
  }
  if (reorderLayout) {
    operations.push("reorder_layout");
  }
  if (
    dimensions.includes("layout") &&
    !addSection &&
    !removeSection &&
    !reorderLayout
  ) {
    operations.push("redesign_layout");
  }
  return operations;
}

function getGuidelines({
  category,
  dimensions,
  magnitude,
}: {
  category: EditIntentClassification["category"];
  dimensions: EditIntentDimension[];
  magnitude: EditIntentMagnitude;
}): string[] {
  if (magnitude === "structural") {
    return [
      "Make a coherent multi-section visual revision within the requested dimensions.",
      "Preserve verified business facts, routes, and unrelated behavior.",
      "Run check_app after the structural revision and resolve any reported issue.",
    ];
  }
  if (category === "media_replace") {
    return [
      "Update approved image references and keep ownership and provenance intact.",
      "Do not modify unrelated layout, facts, or color choices.",
      "Ensure missing images collapse gracefully without empty placeholder boxes.",
    ];
  }
  if (dimensions.includes("style")) {
    return [
      "Change the requested visual system while preserving verified business facts.",
      "Do not change layout unless the edit contract grants layout permission.",
      "Run check_app after applying the visual revision.",
    ];
  }
  return [
    "Modify only the requested content and preserve unrelated components and styling.",
    "Keep customer-facing content grounded in verified project facts.",
    "Run check_app after applying the requested change.",
  ];
}

function getSuggestedMaxSteps({
  dimensions,
  magnitude,
  hasUploadedImages,
}: {
  dimensions: EditIntentDimension[];
  magnitude: EditIntentMagnitude;
  hasUploadedImages: boolean;
}): number {
  if (magnitude === "full_rebuild") {
    return 8;
  }
  if (magnitude === "structural") {
    return 8;
  }
  if (magnitude === "section") {
    return 5;
  }
  if (hasUploadedImages || dimensions.includes("media")) {
    return 3;
  }
  if (dimensions.includes("style")) {
    return 2;
  }
  if (dimensions.includes("content")) {
    return 2;
  }
  return 3;
}

function getTargetFiles({
  existingFiles,
  dimensions,
  hasCopy,
  hasContent,
  hasMedia,
}: {
  existingFiles: string[];
  dimensions: EditIntentDimension[];
  hasCopy: boolean;
  hasContent: boolean;
  hasMedia: boolean;
}): string[] {
  const targets: string[] = [];
  if (hasMedia) {
    targets.push("src/content/site.ts");
    const heroFile = existingFiles.find((file) => file.includes("Hero.tsx"));
    if (heroFile) {
      targets.push(heroFile);
    }
    const catalogFile = existingFiles.find(
      (file) =>
        file.includes("Menu") ||
        file.includes("Catalog") ||
        file.includes("Gallery"),
    );
    if (catalogFile && !targets.includes(catalogFile)) {
      targets.push(catalogFile);
    }
  } else if (dimensions.includes("style") && !dimensions.includes("layout")) {
    targets.push("src/index.css");
  }
  if (hasCopy || hasContent) {
    if (!targets.includes("src/content/site.ts")) {
      targets.push("src/content/site.ts");
    }
    if (
      hasCopy &&
      existingFiles.includes("src/routes/index.tsx") &&
      !targets.includes("src/routes/index.tsx")
    ) {
      targets.push("src/routes/index.tsx");
    }
  }
  if (dimensions.includes("layout")) {
    for (const file of getPresentationFiles(existingFiles)) {
      if (!targets.includes(file)) {
        targets.push(file);
      }
    }
  }
  return targets;
}

function getPresentationFiles(existingFiles: string[]): string[] {
  return existingFiles.filter(
    (file) =>
      file.startsWith("src/components/site/") ||
      file === "src/routes/index.tsx" ||
      file === "src/index.css",
  );
}

function stripDeniedMentions(text: string, terms: RegExp): string {
  return text.replace(
    new RegExp(
      `\\b(?:jangan|tanpa|tidak|nggak|gak|ga)\\b[^.]{0,80}${terms.source}`,
      "giu",
    ),
    "",
  );
}

function hasExplicitLayoutDenial(text: string): boolean {
  return /\b(?:jangan|tanpa|tidak|nggak|gak|ga)\b[^.]{0,80}\b(?:layout|susunan|section|tata\s+letak|komposisi)\b/i.test(
    text,
  );
}

function hasBroadLayoutLanguage(text: string): boolean {
  return /\b(?:semua|seluruh|total|menyeluruh|komprehensif|berani|matang|baru)\b/i.test(
    text,
  );
}

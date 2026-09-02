import { describe, expect, it } from "vitest";

import { ADAPTIVE_EDIT_SCENARIOS } from "./adaptive-edit-corpus";

import {
  classifyEditIntent,
  EDIT_INTENT_DIMENSIONS,
  editIntentSchema,
} from "@/lib/projects/edit-intent";

const MOCK_FILES = [
  "src/content/site.ts",
  "src/components/site/Header.tsx",
  "src/components/site/Hero.tsx",
  "src/components/site/MenuCatalog.tsx",
  "src/components/site/LocationAndContact.tsx",
  "src/components/site/Footer.tsx",
  "src/routes/index.tsx",
  "src/index.css",
];

describe("classifyEditIntent", () => {
  it("classifies media replacement when images are uploaded", () => {
    const result = classifyEditIntent({
      instruction: "gambarku hilang semua tambahin 2 gambar ini dong",
      hasUploadedImages: true,
      existingFiles: MOCK_FILES,
    });

    expect(result.category).toBe("media_replace");
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
    expect(result.suggestedMaxSteps).toBe(3);
    expect(result.targetFiles).toContain("src/content/site.ts");
    expect(result.targetFiles).toContain("src/components/site/Hero.tsx");
  });

  it("ignores denied visual dimensions for a media-only replacement", () => {
    const result = classifyEditIntent({
      instruction:
        "Ganti foto utama dengan foto usaha yang sudah diunggah. Jangan ubah warna, layout, atau isi lain.",
      existingFiles: MOCK_FILES,
    });

    expect(result.dimensions).toEqual(["media"]);
    expect(result.allowedOperations).toEqual(["update_media"]);
  });

  it("classifies media replacement from Indonesian keywords without attachments", () => {
    const result = classifyEditIntent({
      instruction: "ganti foto utama dan tambah galeri produk",
      existingFiles: MOCK_FILES,
    });

    expect(result.category).toBe("media_replace");
    expect(result.targetFiles).toContain("src/content/site.ts");
  });

  it("ignores denied photos when classifying a palette-only edit", () => {
    const result = classifyEditIntent({
      instruction:
        "Ubah palet warna menjadi lebih hangat. Jangan ubah layout, foto, atau isi.",
      existingFiles: MOCK_FILES,
    });

    expect(result.dimensions).toEqual(["style"]);
    expect(result.allowedOperations).toEqual(["update_style"]);
    expect(result.targetFiles).toEqual(["src/index.css"]);
  });

  it("classifies style palette change from color keywords", () => {
    const result = classifyEditIntent({
      instruction: "ganti warnanya jadi tema hitam putih monokrom minimalis",
      existingFiles: MOCK_FILES,
    });

    expect(result.category).toBe("style_palette");
    expect(result.suggestedMaxSteps).toBe(2);
    expect(result.targetFiles).toContain("src/index.css");
  });

  it("classifies copy update from business fact keywords", () => {
    const result = classifyEditIntent({
      instruction:
        "ganti nomor whatsapp jadi 081298765432 dan jam buka 08.00 - 22.00",
      existingFiles: MOCK_FILES,
    });

    expect(result.category).toBe("copy_content");
    expect(result.suggestedMaxSteps).toBe(2);
    expect(result.targetFiles).toContain("src/content/site.ts");
  });

  it("includes the route source for visible copy changes", () => {
    const result = classifyEditIntent({
      instruction: "ubah teks tombol utama",
      existingFiles: MOCK_FILES,
    });

    expect(result.category).toBe("copy_content");
    expect(result.targetFiles).toContain("src/routes/index.tsx");
  });

  it("does not misclassify a copy request that forbids image changes", () => {
    const result = classifyEditIntent({
      instruction:
        "Ubah teks semua tombol ajakan utama menjadi 'Hubungi via WhatsApp'. Hanya ubah teks tombol, jangan ubah tata letak, warna, gambar, isi lain, atau file lain.",
      existingFiles: MOCK_FILES,
    });

    expect(result.category).toBe("copy_content");
    expect(result.targetFiles).toEqual([
      "src/content/site.ts",
      "src/routes/index.tsx",
    ]);
  });

  it("classifies full restructure only when explicit command is given", () => {
    const result = classifyEditIntent({
      instruction: "tolong rombak total website ini dari awal",
      existingFiles: MOCK_FILES,
    });

    expect(result.category).toBe("full_restructure");
    expect(result.suggestedMaxSteps).toBe(8);
  });

  it("matches the intended dimensions for every corpus scenario", () => {
    for (const scenario of ADAPTIVE_EDIT_SCENARIOS) {
      const result = classifyEditIntent({
        instruction: scenario.instruction,
        existingFiles: MOCK_FILES,
      });

      const expectedDimensions = scenario.tags.includes("explicit_full_rebuild")
        ? EDIT_INTENT_DIMENSIONS
        : scenario.dimensions;
      expect(new Set(result.dimensions), scenario.id).toEqual(
        new Set(expectedDimensions),
      );
    }
  });

  it("returns a valid adaptive contract for every corpus scenario", () => {
    for (const scenario of ADAPTIVE_EDIT_SCENARIOS) {
      const result = classifyEditIntent({
        instruction: scenario.instruction,
        existingFiles: MOCK_FILES,
      });

      expect(editIntentSchema.safeParse(result).success, scenario.id).toBe(
        true,
      );
    }
  });

  it("keeps palette-only edits from gaining layout permission", () => {
    const result = classifyEditIntent({
      instruction: "Ubah warna utama saja, jangan ubah layout atau isi.",
      existingFiles: MOCK_FILES,
    });

    expect(result.dimensions).toEqual(["style"]);
    expect(result.allowsLayout).toBe(false);
    expect(result.magnitude).toBe("surgical");
  });

  it("grants layout permission to an explicit premium redesign", () => {
    const result = classifyEditIntent({
      instruction:
        "Buat website terasa lebih premium dengan hierarki, komposisi, dan responsive layout yang lebih matang.",
      existingFiles: MOCK_FILES,
    });

    expect(result.dimensions).toEqual(["style", "layout"]);
    expect(result.allowsLayout).toBe(true);
    expect(result.magnitude).toBe("structural");
  });

  it("requires explicit full-rebuild language", () => {
    const regular = classifyEditIntent({
      instruction: "Buat tampilannya lebih modern dan rapi.",
      existingFiles: MOCK_FILES,
    });
    const rebuild = classifyEditIntent({
      instruction: "Bangun ulang seluruh website dari awal.",
      existingFiles: MOCK_FILES,
    });

    expect(regular.magnitude).not.toBe("full_rebuild");
    expect(rebuild.magnitude).toBe("full_rebuild");
  });

  it("marks an unscoped request for one clarification instead of execution", () => {
    const result = classifyEditIntent({
      instruction: "Tolong bikin lebih bagus.",
      existingFiles: MOCK_FILES,
    });

    expect(result.clarificationRequired).toBe(true);
    expect(result.allowedOperations).toEqual([]);
    expect(result.suggestedMaxSteps).toBe(0);
  });
});

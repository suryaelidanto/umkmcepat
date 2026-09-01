import { describe, expect, it } from "vitest";

import { classifyEditIntent } from "@/lib/projects/edit-intent";

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

  it("classifies media replacement from Indonesian keywords without attachments", () => {
    const result = classifyEditIntent({
      instruction: "ganti foto utama dan tambah galeri produk",
      existingFiles: MOCK_FILES,
    });

    expect(result.category).toBe("media_replace");
    expect(result.targetFiles).toContain("src/content/site.ts");
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
});

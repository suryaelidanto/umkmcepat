import { describe, expect, it } from "vitest";

import { classifyEditStructure } from "./edit-structure";

describe("classifyEditStructure", () => {
  it("classifies page-set / route changes as structural", () => {
    const result = classifyEditStructure("tambah halaman katalog baru");
    expect(result.kind).toBe("structural");
  });

  it("classifies copy/style changes as non-structural", () => {
    const result = classifyEditStructure("ubah warna tombol jadi hijau");
    expect(result.kind).toBe("non_structural");
  });

  it("classifies primary CTA change as structural", () => {
    const result = classifyEditStructure("ganti tombol utama jadi telepon");
    expect(result.kind).toBe("structural");
  });

  it("returns non-structural for empty input", () => {
    expect(classifyEditStructure("").kind).toBe("non_structural");
  });
});

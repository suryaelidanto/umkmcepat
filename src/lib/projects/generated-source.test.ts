import { describe, expect, it } from "vitest";

import {
  assertSafeProjectFilePath,
  createGeneratedProjectFiles,
  parseGeneratedProjectFiles,
} from "./generated-source";
import { createProjectSiteSchemaFromBrief } from "./site-schema";

describe("generated project source", () => {
  it("keeps valid stored files only", () => {
    expect(
      parseGeneratedProjectFiles([
        { path: "src/App.tsx", content: "export default function App() {}" },
        { path: 123, content: "bad" },
        null,
      ]),
    ).toEqual([
      { path: "src/App.tsx", content: "export default function App() {}" },
    ]);
  });

  it("rejects unsafe paths", () => {
    expect(() => assertSafeProjectFilePath("../secret.ts")).toThrow();
    expect(() => assertSafeProjectFilePath("C:/secret.ts")).toThrow();
    expect(() => assertSafeProjectFilePath("node_modules/x.js")).toThrow();
    expect(() => assertSafeProjectFilePath(".env")).toThrow();
  });

  it("generates domain-aware source variants instead of one static template", () => {
    const angkringanFiles = createGeneratedProjectFiles(
      "project_angkringan",
      createProjectSiteSchemaFromBrief({
        version: 1,
        prompt: "buatkan website jualan angkringan",
        businessName: "",
        businessType: "Warung fisik dan pesanan online",
        offer: "Nasi kucing, sate usus, gorengan, wedang jahe",
        targetCustomer: "Anak kos dan mahasiswa",
        contactOrCta: "WA + Google Maps",
        stylePreference: "Hangat tradisional kayu",
        notes: [],
      }),
    );
    const laundryFiles = createGeneratedProjectFiles(
      "project_laundry",
      createProjectSiteSchemaFromBrief({
        version: 1,
        prompt: "buatkan website laundry kiloan",
        businessName: "",
        businessType: "Laundry kiloan dan satuan",
        offer: "Cuci setrika, laundry ekspres, antar jemput",
        targetCustomer: "Karyawan dan keluarga sekitar",
        contactOrCta: "Booking lewat WhatsApp",
        stylePreference: "Bersih modern",
        notes: [],
      }),
    );
    const angkringanApp = readGeneratedFile(angkringanFiles, "src/App.tsx");
    const laundryApp = readGeneratedFile(laundryFiles, "src/App.tsx");
    const angkringanCss = readGeneratedFile(angkringanFiles, "src/styles.css");
    const laundryCss = readGeneratedFile(laundryFiles, "src/styles.css");

    expect(angkringanApp).toContain("variant-warm");
    expect(laundryApp).toContain("variant-clean");
    expect(angkringanCss).toContain(".menu-strip");
    expect(laundryCss).toContain(".service-grid");
    expect(angkringanApp).not.toBe(laundryApp);
    expect(angkringanCss).not.toBe(laundryCss);
  });
});

function readGeneratedFile(
  files: ReturnType<typeof createGeneratedProjectFiles>,
  path: string,
) {
  const file = files.find((item) => item.path === path);

  if (!file) {
    throw new Error(`Missing generated file: ${path}`);
  }

  return file.content;
}

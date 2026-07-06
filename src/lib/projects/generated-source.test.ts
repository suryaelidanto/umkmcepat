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
    const angkringanFiles = createFiles("project_angkringan", {
      prompt: "buatkan website jualan angkringan",
      businessType: "Warung fisik dan pesanan online",
      offer: "Nasi kucing, sate usus, gorengan, wedang jahe",
      targetCustomer: "Anak kos dan mahasiswa",
      contactOrCta: "WA + Google Maps",
      stylePreference: "Hangat tradisional kayu",
    });
    const laundryFiles = createFiles("project_laundry", {
      prompt: "buatkan website laundry kiloan",
      businessType: "Laundry kiloan dan satuan",
      offer: "Cuci setrika, laundry ekspres, antar jemput",
      targetCustomer: "Karyawan dan keluarga sekitar",
      contactOrCta: "Booking lewat WhatsApp",
      stylePreference: "Bersih modern",
    });
    const bengkelFiles = createFiles("project_bengkel", {
      prompt: "buatkan website bengkel motor",
      businessType: "Bengkel servis motor harian",
      offer: "Ganti oli, servis ringan, cek rem, tune up",
      targetCustomer: "Pengendara motor sekitar",
      contactOrCta: "Reservasi servis lewat WhatsApp",
      stylePreference: "Tegas, teknis, dan rapi",
    });
    const tokoFiles = createFiles("project_toko", {
      prompt: "buatkan website toko makanan",
      businessType: "Toko makanan rumahan",
      offer: "Frozen food, lauk siap santap, camilan keluarga",
      targetCustomer: "Ibu rumah tangga dan pekerja sekitar",
      contactOrCta: "Pesan katalog lewat WhatsApp",
      stylePreference: "Rapi, hangat, dan mudah dipilih",
    });
    const jasaFiles = createFiles("project_jasa", {
      prompt: "buatkan website jasa les privat",
      businessType: "Jasa les privat datang ke rumah",
      offer: "Les matematika, bahasa Inggris, dan persiapan ujian",
      targetCustomer: "Orang tua murid SD sampai SMA",
      contactOrCta: "Konsultasi jadwal lewat WhatsApp",
      stylePreference: "Profesional, tenang, dan terpercaya",
    });
    const angkringanApp = readGeneratedFile(angkringanFiles, "src/App.tsx");
    const laundryApp = readGeneratedFile(laundryFiles, "src/App.tsx");
    const bengkelApp = readGeneratedFile(bengkelFiles, "src/App.tsx");
    const tokoApp = readGeneratedFile(tokoFiles, "src/App.tsx");
    const jasaApp = readGeneratedFile(jasaFiles, "src/App.tsx");
    const angkringanCss = readGeneratedFile(angkringanFiles, "src/styles.css");
    const laundryCss = readGeneratedFile(laundryFiles, "src/styles.css");
    const bengkelCss = readGeneratedFile(bengkelFiles, "src/styles.css");
    const tokoCss = readGeneratedFile(tokoFiles, "src/styles.css");
    const jasaCss = readGeneratedFile(jasaFiles, "src/styles.css");

    expect(angkringanApp).toContain("variant-warm");
    expect(laundryApp).toContain("variant-clean");
    expect(bengkelApp).toContain("variant-technical");
    expect(tokoApp).toContain("variant-retail");
    expect(jasaApp).toContain("variant-editorial");
    expect(angkringanCss).toContain(".menu-strip");
    expect(laundryCss).toContain(".service-grid");
    expect(bengkelCss).toContain(".checklist-panel");
    expect(tokoCss).toContain(".product-grid");
    expect(jasaCss).toContain(".variant-editorial");
    expect(
      new Set([angkringanCss, laundryCss, bengkelCss, tokoCss, jasaCss]).size,
    ).toBe(5);
  });

  it("adds a preview-ready signal after the generated React app renders", () => {
    const app = readGeneratedFile(
      createFiles("project_ready_signal", {
        prompt: "buatkan website jasa potong rambut",
        businessType: "Jasa pangkas rambut",
        offer: "Potong rambut, cukur rapi, dan styling cepat",
        targetCustomer: "Pria dewasa sekitar",
        contactOrCta: "Booking lewat WhatsApp",
        stylePreference: "Bersih dan profesional",
      }),
      "src/App.tsx",
    );

    expect(app).toContain("useEffect");
    expect(app).toContain("umkmcepat-preview-ready");
  });
});

function createFiles(
  projectId: string,
  input: {
    businessType: string;
    contactOrCta: string;
    offer: string;
    prompt: string;
    stylePreference: string;
    targetCustomer: string;
  },
) {
  return createGeneratedProjectFiles(
    projectId,
    createProjectSiteSchemaFromBrief({
      version: 1,
      businessName: "",
      notes: [],
      ...input,
    }),
  );
}

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

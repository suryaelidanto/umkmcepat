import { describe, expect, it } from "vitest";

import { validateGeneratedAppManifest } from "./generated-app-manifest";
import {
  assertSafeProjectFilePath,
  buildGeneratedProject,
  createGeneratedProjectFiles,
  createGeneratedSourceSnapshotMetadata,
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

  it("generates seven beta fixture variants with distinct structure and safe static content", () => {
    const fixtures = [
      {
        key: "angkringan",
        variant: "angkringan",
        marker: ".night-menu",
        input: {
          prompt: "buatkan website angkringan dekat kampus",
          businessType: "Angkringan malam dekat kampus",
          offer: "Nasi kucing, sate usus, gorengan, kopi jos, wedang jahe",
          targetCustomer: "Mahasiswa, anak kos, dan pekerja malam",
          contactOrCta: "Arahkan ke WhatsApp dan Google Maps",
          stylePreference: "Hangat tradisional dengan nuansa lampu malam",
        },
      },
      {
        key: "laundry",
        variant: "laundry",
        marker: ".service-grid",
        input: {
          prompt: "buatkan website laundry kiloan antar jemput",
          businessType: "Laundry kiloan dan satuan",
          offer: "Cuci setrika, laundry ekspres, antar jemput, cuci sepatu",
          targetCustomer: "Karyawan, keluarga muda, dan penghuni kos",
          contactOrCta: "Booking pickup lewat WhatsApp",
          stylePreference: "Bersih modern, rapi, dan ringan",
        },
      },
      {
        key: "coffee",
        variant: "coffee",
        marker: ".brew-board",
        input: {
          prompt: "buatkan website coffee shop kecil untuk kerja remote",
          businessType: "Coffee shop kecil",
          offer: "Espresso based, manual brew, pastry, area kerja nyaman",
          targetCustomer: "Mahasiswa dan pekerja remote",
          contactOrCta: "Lihat menu dan tanya lokasi lewat WhatsApp",
          stylePreference: "Hangat premium sederhana dengan suasana tenang",
        },
      },
      {
        key: "barber",
        variant: "barber",
        marker: ".cut-list",
        input: {
          prompt: "buatkan website barber shop booking whatsapp",
          businessType: "Barber shop pria",
          offer: "Haircut, shave, styling, hair wash",
          targetCustomer: "Pria dewasa dan pekerja sekitar",
          contactOrCta: "Booking jadwal lewat WhatsApp",
          stylePreference: "Tegas, maskulin, bersih, kontras",
        },
      },
      {
        key: "fashion",
        variant: "fashion",
        marker: ".lookbook-grid",
        input: {
          prompt: "buatkan website fashion shop koleksi harian",
          businessType: "Fashion shop lokal",
          offer: "Atasan, outer, celana, koleksi warna netral",
          targetCustomer: "Perempuan muda yang suka outfit simpel",
          contactOrCta: "Tanya stok dan ukuran lewat WhatsApp",
          stylePreference: "Editorial, clean, seperti lookbook",
        },
      },
      {
        key: "tutoring",
        variant: "tutoring",
        marker: ".learning-path",
        input: {
          prompt: "buatkan website jasa les privat sd smp sma",
          businessType: "Jasa les privat",
          offer: "Matematika, bahasa Inggris, persiapan ujian, pendampingan PR",
          targetCustomer: "Orang tua murid SD sampai SMA",
          contactOrCta: "Konsultasi jadwal lewat WhatsApp",
          stylePreference: "Profesional, tenang, dan terpercaya",
        },
      },
      {
        key: "homeFood",
        variant: "home-food",
        marker: ".daily-menu",
        input: {
          prompt: "buatkan website usaha makanan rumahan pre order",
          businessType: "Usaha makanan rumahan",
          offer: "Nasi box, lauk harian, sambal, katering kecil, pre order",
          targetCustomer: "Keluarga sekitar dan pekerja kantor",
          contactOrCta: "Pesan menu hari ini lewat WhatsApp",
          stylePreference: "Hangat rumahan, segar, dan mudah dipesan",
        },
      },
    ] as const;

    const outputs = fixtures.map((fixture) => {
      const files = createFiles(`project_${fixture.key}`, fixture.input);
      const app = readGeneratedFile(files, "src/App.tsx");
      const css = readGeneratedFile(files, "src/styles.css");
      const manifest = validateGeneratedAppManifest(files);

      expect(app).toContain(`variant-${fixture.variant}`);
      expect(css).toContain(fixture.marker);
      expect(app).toContain("umkmcepat-preview-ready");
      expect(app).not.toMatch(/checkout|payment|login|register|api\//i);
      expect(css).not.toMatch(/checkout|payment|login|register|api\//i);
      expect(manifest.ok).toBe(true);

      return { app, css };
    });

    expect(new Set(outputs.map((output) => output.css)).size).toBe(7);
    expect(new Set(outputs.map((output) => output.app)).size).toBe(7);
  });

  it("uses an automotive layout for bengkel motor fallback output", () => {
    const files = createFiles("project_bengkel", {
      prompt: "buatkan website bengkel motor",
      businessType: "Bengkel servis motor harian",
      offer:
        "Ganti ban dan velg, perbaikan kelistrikan, aki, lampu, klakson, ECU",
      targetCustomer: "Pengendara harian dan pekerja sekitar",
      contactOrCta: "Booking servis lewat WhatsApp",
      stylePreference: "Modern bersih dan teknis",
    });

    expect(readGeneratedFile(files, "src/App.tsx")).toContain(
      "variant-automotive",
    );
    expect(readGeneratedFile(files, "src/styles.css")).toContain(
      ".garage-board",
    );
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

  it("generates a valid app manifest for the static React profile", () => {
    const files = createFiles("project_manifest", {
      prompt: "buatkan website coffee shop",
      businessType: "Coffee shop kecil",
      offer: "Menu kopi, suasana tempat, dan lokasi",
      targetCustomer: "Mahasiswa dan pekerja remote",
      contactOrCta: "Hubungi lewat WhatsApp",
      stylePreference: "Hangat dan premium sederhana",
    });

    const result = validateGeneratedAppManifest(files);

    expect(result.ok).toBe(true);
    expect(result.manifest).toMatchObject({
      buildCommand: "bun run build",
      outputDirectory: "dist",
      packageManager: "bun",
      projectId: "project_manifest",
      runtimeProfile: "static-react-v1",
      schemaVersion: "1",
      templateId: "vite-react-frontend-static",
      templateVersion: "1.0.0",
    });
  });

  it("creates snapshot metadata with manifest, origin, and summary", () => {
    const schema = createProjectSiteSchemaFromBrief({
      businessName: "",
      businessType: "Laundry kiloan",
      contactOrCta: "WhatsApp",
      notes: [],
      offer: "Cuci setrika dan antar jemput",
      prompt: "buat website laundry",
      stylePreference: "Bersih",
      targetCustomer: "Keluarga sekitar",
      version: 1,
    });
    const files = createGeneratedProjectFiles("project_snapshot", schema);

    expect(createGeneratedSourceSnapshotMetadata(files, schema)).toMatchObject({
      manifest: {
        projectId: "project_snapshot",
        runtimeProfile: "static-react-v1",
        schemaVersion: "1",
      },
      origin: {
        generator: "site-schema",
        sourceType: "generated",
      },
      sourceFileCount: files.length,
      summary: {
        businessName: schema.businessName,
        runtimeProfile: "static-react-v1",
      },
    });
  });

  it("fails build preflight when the generated app manifest is missing", async () => {
    const result = await buildGeneratedProject([
      {
        content: JSON.stringify({
          private: true,
          scripts: { build: "echo should-not-run" },
        }),
        path: "package.json",
      },
    ]);

    expect(result.ok).toBe(false);
    expect(result.distFiles).toEqual([]);
    expect(result.log).toContain("Generated app manifest failed preflight");
    expect(result.log).toContain("Missing .umkmcepat/project.json manifest.");
  });

  it("fails build preflight when package policy rejects a dependency", async () => {
    const files = createFiles("project_blocked_package", {
      prompt: "buat website barber shop",
      businessType: "Barber shop",
      offer: "Potong rambut dan booking WhatsApp",
      targetCustomer: "Pelanggan sekitar",
      contactOrCta: "Booking lewat WhatsApp",
      stylePreference: "Rapi dan tegas",
    }).map((file) =>
      file.path === "package.json"
        ? {
            ...file,
            content: JSON.stringify({
              dependencies: { express: "file:./missing" },
              scripts: { build: "vite build" },
            }),
          }
        : file,
    );

    const result = await buildGeneratedProject(files);

    expect(result.ok).toBe(false);
    expect(result.distFiles).toEqual([]);
    expect(result.log).toContain(
      "Generated app package policy failed preflight",
    );
    expect(result.log).toContain(
      "Package is not allowed for static-react-v1: express",
    );
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

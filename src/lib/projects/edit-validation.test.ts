import { describe, expect, it } from "vitest";

import { validateGeneratedEdit } from "./edit-validation";
import { type GeneratedProjectFile } from "./generated-source";

const baseFiles: GeneratedProjectFile[] = [
  {
    path: "src/routes/index.tsx",
    content:
      '<main className="site-shell"><nav className="topbar">Bengkel</nav><h1>Servis motor</h1></main>',
  },
  {
    path: "src/styles.css",
    content:
      ".site-shell{background:#101211}.topbar{background:#fff;color:#fff}",
  },
  { path: "package.json", content: "{}" },
];

const visualInstruction = "visual comment";

describe("validateGeneratedEdit", () => {
  it("reports no-op CSS selectors as advisory, not hard failure", () => {
    const nextFiles = baseFiles.map((file) =>
      file.path === "src/styles.css"
        ? {
            ...file,
            content: `${file.content}\n.hero-card{outline:2px solid red}`,
          }
        : file,
    );

    expect(
      validateGeneratedEdit({
        baseFiles,
        instruction: visualInstruction,
        nextFiles,
        touchedFiles: ["src/styles.css"],
      }),
    ).toMatchObject({
      advisoryIssues: [
        "CSS selector .hero-card does not match generated source.",
      ],
      blockingIssues: [],
      changedFiles: ["src/styles.css"],
      ok: true,
    });
  });

  it("blocks edits that do not touch rendered source", () => {
    const nextFiles = [...baseFiles, { path: "AGENTS.md", content: "updated" }];

    expect(
      validateGeneratedEdit({
        baseFiles,
        instruction: visualInstruction,
        nextFiles,
        touchedFiles: ["AGENTS.md"],
      }),
    ).toMatchObject({ ok: false });
  });

  it("accepts relevant visual edits", () => {
    const nextFiles = baseFiles.map((file) =>
      file.path === "src/styles.css"
        ? {
            ...file,
            content: `${file.content}\n.topbar{background:#151515;color:#f7f7f2}`,
          }
        : file,
    );

    expect(
      validateGeneratedEdit({
        baseFiles,
        instruction: visualInstruction,
        nextFiles,
        touchedFiles: ["src/styles.css"],
      }),
    ).toMatchObject({ advisoryIssues: [], blockingIssues: [], ok: true });
  });

  it("accepts parent/theme variable fixes without target tokens", () => {
    const nextFiles = baseFiles.map((file) =>
      file.path === "src/styles.css"
        ? {
            ...file,
            content: `${file.content}\n:root{--nav-bg:#151515;--nav-fg:#f7f7f2}`,
          }
        : file,
    );

    expect(
      validateGeneratedEdit({
        baseFiles,
        instruction: visualInstruction,
        nextFiles,
        touchedFiles: ["src/styles.css"],
      }).ok,
    ).toBe(true);
  });
});

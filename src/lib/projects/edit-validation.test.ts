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

const visualInstruction = `Apply these visual comments to the generated website source.

Visual comments:
[
  {
    "label": "Bagian website — \"Bengkel\"",
    "comment": "navbar warnanya jangan nabrak",
    "target": {
      "classes": "topbar",
      "selectorPath": "main > nav.topbar",
      "tag": "nav",
      "text": "Bengkel",
      "boundingBox": { "x": 0, "y": 0, "width": 100, "height": 40 }
    }
  }
]`;

describe("validateGeneratedEdit", () => {
  it("rejects no-op CSS selectors", () => {
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
    ).toEqual({
      issues: ["CSS selector .hero-card does not match generated source."],
      ok: false,
    });
  });

  it("rejects edits that do not touch rendered source", () => {
    const nextFiles = [...baseFiles, { path: "AGENTS.md", content: "updated" }];

    expect(
      validateGeneratedEdit({
        baseFiles,
        instruction: visualInstruction,
        nextFiles,
        touchedFiles: ["AGENTS.md"],
      }).ok,
    ).toBe(false);
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
    ).toEqual({ issues: [], ok: true });
  });
});

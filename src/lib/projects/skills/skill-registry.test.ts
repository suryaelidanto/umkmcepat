import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  executeSkillScript,
  PROJECT_CORE_SKILL_NAMES,
  PROJECT_SCRIPT_SKILL_NAMES,
  PROJECT_SKILL_NAMES,
  readProjectSkill,
  skillEngine,
} from "./skill-registry";

describe("DynamicSkillEngine", () => {
  it("auto-discovers root skills dynamically without hardcoding", () => {
    expect(PROJECT_CORE_SKILL_NAMES).toContain("impeccable");
    expect(PROJECT_CORE_SKILL_NAMES).toContain("shadcn");
    expect(PROJECT_CORE_SKILL_NAMES).toContain("unslop");
    expect(PROJECT_CORE_SKILL_NAMES).toContain("impeccable/reference/new-work");
    expect(PROJECT_CORE_SKILL_NAMES).toContain(
      "impeccable/reference/craft-floor",
    );
  });

  it("loads the project Unslop skill as an exact copy of the source skill", () => {
    const source = readFileSync(".agents/skills/unslop/SKILL.md", "utf8");
    expect(readProjectSkill("unslop").content).toBe(source);
  });

  it("indexes all nested markdown documents with clean slug access", () => {
    expect(PROJECT_SKILL_NAMES.length).toBeGreaterThan(30);

    const impeccable = readProjectSkill("impeccable");
    expect(impeccable.content.length).toBeGreaterThan(100);

    const rules = readProjectSkill("shadcn-styling");
    expect(rules.content.length).toBeGreaterThan(50);
  });

  it("can execute an entrypoint with script arguments", async () => {
    const result = await executeSkillScript("impeccable", "palette", {
      id: "seed-200",
    });
    expect(result.ok).toBe(true);
    expect(typeof result.output).toBe("string");
  });

  it("blocks helper subdirectory scripts from direct execution", async () => {
    const result = await executeSkillScript(
      "impeccable",
      "lib/roll-selection.mjs",
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("helper");
  });

  it("rejects path traversal targets without executing anything", async () => {
    const result = await executeSkillScript("impeccable", "../../etc/passwd");
    expect(result.ok).toBe(false);
  });

  it("discovers a newly added entrypoint script without hardcoding", async () => {
    const fixture = path.join(
      "src",
      "lib",
      "projects",
      "skills",
      "impeccable",
      "scripts",
      "__entry-fixture.mjs",
    );
    fsWriteFixture(fixture);
    try {
      skillEngine.refresh();
      const result = await executeSkillScript("impeccable", "__entry-fixture");
      expect(result.ok).toBe(true);
    } finally {
      fsRemoveFixture(fixture);
      skillEngine.refresh();
    }
  });

  it("derives script-enabled skills from discovery, not a literal list", () => {
    expect(PROJECT_SCRIPT_SKILL_NAMES).toContain("impeccable");
    expect(PROJECT_SCRIPT_SKILL_NAMES).not.toContain("shadcn");
    expect(PROJECT_SCRIPT_SKILL_NAMES).not.toContain("unslop");
  });
});

function fsWriteFixture(filePath: string): void {
  writeFileSync(filePath, "// temp entrypoint fixture\n");
}

function fsRemoveFixture(filePath: string): void {
  rmSync(filePath, { force: true });
}

describe("sandboxed script spawning", () => {
  const scriptsDir = path.join(
    "src",
    "lib",
    "projects",
    "skills",
    "impeccable",
    "scripts",
  );
  const markerPath = path.join(scriptsDir, "__sandbox-marker.txt");

  function writeFixture(name: string, content: string): void {
    writeFileSync(path.join(scriptsDir, name), content);
  }

  function clearFixtures(): void {
    for (const name of [
      "__sandbox-env.mjs",
      "__sandbox-loop.mjs",
      "__sandbox-flood.mjs",
      "__sandbox-marker.mjs",
      "__sandbox-marker.txt",
    ]) {
      rmSync(path.join(scriptsDir, name), { force: true });
    }
    skillEngine.refresh();
  }

  it("passes a scrubbed environment of exactly PATH and DO_NOT_TRACK", async () => {
    writeFixture(
      "__sandbox-env.mjs",
      "console.log(JSON.stringify({ dnt: process.env.DO_NOT_TRACK ?? null, keys: Object.keys(process.env).sort() }));\n",
    );
    skillEngine.refresh();
    try {
      const result = await executeSkillScript("impeccable", "__sandbox-env");
      expect(result.ok).toBe(true);
      const reported = JSON.parse(String(result.output)) as {
        dnt: string | null;
        keys: string[];
      };
      expect(reported.keys).toEqual(["DO_NOT_TRACK", "PATH"]);
      expect(reported.dnt).toBe("1");
    } finally {
      clearFixtures();
    }
  });

  it("kills a hung script and reports a timeout", async () => {
    writeFixture("__sandbox-loop.mjs", "setInterval(() => {}, 1000);\n");
    skillEngine.refresh();
    try {
      const result = await executeSkillScript(
        "impeccable",
        "__sandbox-loop",
        {},
        { timeoutMs: 300 },
      );
      expect(result.ok).toBe(false);
      expect(result.error).toContain("timed out");
    } finally {
      clearFixtures();
    }
  });

  it("exposes a timeout constant within the 12s budget", async () => {
    const sandbox = await import("./script-sandbox");
    expect(sandbox.SCRIPT_TIMEOUT_MS).toBeLessThanOrEqual(12_000);
    expect(sandbox.MAX_SCRIPT_OUTPUT_BYTES).toBeLessThanOrEqual(
      2 * 1024 * 1024,
    );
  });

  it("truncates oversized output while keeping ok true", async () => {
    writeFixture(
      "__sandbox-flood.mjs",
      'console.log("x".repeat(3 * 1024 * 1024));\n',
    );
    skillEngine.refresh();
    try {
      const result = await executeSkillScript("impeccable", "__sandbox-flood");
      expect(result.ok).toBe(true);
      const output = String(result.output);
      expect(output.length).toBeLessThanOrEqual(2 * 1024 * 1024 + 200);
      expect(output).toContain("[umkm:skill-output-truncated]");
    } finally {
      clearFixtures();
    }
  });

  it("rejects non-allowlisted arguments before spawning", async () => {
    writeFixture(
      "__sandbox-marker.mjs",
      'import { writeFileSync } from "node:fs";\nwriteFileSync(new URL("./__sandbox-marker.txt", import.meta.url), "spawned\\n");\n',
    );
    skillEngine.refresh();
    try {
      rmSync(markerPath, { force: true });
      const rejected = await executeSkillScript(
        "impeccable",
        "__sandbox-marker",
        { unlisted: true },
      );
      expect(rejected.ok).toBe(false);
      expect(rejected.error).toContain("allowlist");
      const { existsSync } = await import("node:fs");
      expect(existsSync(markerPath)).toBe(false);

      const spawned = await executeSkillScript(
        "impeccable",
        "__sandbox-marker",
      );
      expect(spawned.ok).toBe(true);
      expect(existsSync(markerPath)).toBe(true);
    } finally {
      clearFixtures();
    }
  });
});

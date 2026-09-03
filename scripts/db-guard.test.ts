import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SCRIPT_PATH = fileURLToPath(new URL("./db-guard.ts", import.meta.url));

describe("db-guard", () => {
  it("blocks destructive migrate reset operations", () => {
    const result = spawnSync("bun", [SCRIPT_PATH, "migrate", "reset"], {
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CRITICAL DATABASE SAFETY GUARD");
    expect(result.stderr).toContain("PERMANENTLY BLOCKED");
  });

  it("blocks force-reset flags", () => {
    const result = spawnSync(
      "bun",
      [SCRIPT_PATH, "db", "push", "--force-reset"],
      {
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PERMANENTLY BLOCKED");
  });
});

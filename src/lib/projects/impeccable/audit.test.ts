import { describe, expect, it } from "vitest";

import { runDesignAuditInMemory } from "./audit";

describe("runDesignAuditInMemory", () => {
  it("passes cleanly on well-formed semantic TSX files", async () => {
    const files = new Map<string, string>([
      [
        "src/components/site/Hero.tsx",
        `
import React from "react";
export function Hero() {
  return (
    <section className="py-16 bg-background text-foreground">
      <h1 className="text-4xl font-bold tracking-tight">Judul Bersih</h1>
      <p className="mt-4 text-base text-foreground/80">Deskripsi dengan kontras yang baik.</p>
    </section>
  );
}
        `.trim(),
      ],
    ]);

    const result = await runDesignAuditInMemory(files);
    expect(result.ok).toBe(true);
    expect(result.issuesCount).toBe(0);
  });
});

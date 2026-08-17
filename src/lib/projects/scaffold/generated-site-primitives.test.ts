import { describe, expect, it } from "vitest";

import { createGeneratedSitePrimitiveFiles } from "./generated-site-primitives";

describe("generated site primitive files", () => {
  it("exports rich creative layout primitives", () => {
    const files = createGeneratedSitePrimitiveFiles({
      id: "editorial-airy",
      version: 1,
    } as never);
    const layout = files.find(
      (f) => f.path === "src/components/site/layout.tsx",
    );
    expect(layout).toBeDefined();
    expect(layout?.content).toContain("export function BentoGrid");
    expect(layout?.content).toContain("export function BentoCard");
    expect(layout?.content).toContain("export function BadgePill");
    expect(layout?.content).toContain("export function StatCounter");
    expect(layout?.content).toContain("export function TestimonialCard");
  });
});

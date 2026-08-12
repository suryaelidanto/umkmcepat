import { describe, expect, it } from "vitest";

import { buildTargetedRepairPrompt } from "./batched-prompt";

import type { GeneratedProjectFile } from "./generated-types";

const SITE_TS = `export const site = {
  businessName: "SuryaPhone",
  headline: "iPhone bekas berkualitas",
  primaryCta: "Chat WhatsApp",
  sections: [{ title: "Produk" }],
  testimonials: [{ quote: "q", author: "a" }],
  socialLinks: [{ label: "IG", href: "https://ig.com" }],
} as const;
export default site;`;

const INDEX_TSX = `import { site } from "@/content/site";
export function HomeRouteComponent() { return <main />; }`;

describe("buildTargetedRepairPrompt", () => {
  it("includes the site.ts data source so the model can render the named site.<field> instead of inventing local data", () => {
    const stagedMap = new Map<string, { content: string; path: string }>();
    stagedMap.set("src/content/site.ts", {
      content: SITE_TS,
      path: "src/content/site.ts",
    });
    stagedMap.set("src/routes/index.tsx", {
      content: INDEX_TSX,
      path: "src/routes/index.tsx",
    });

    const { user } = buildTargetedRepairPrompt({
      diagnostics: [
        "src/routes/index.tsx does not render site.sections — site.ts has data for this field but it never appears inside JSX. Render it as a visible element, not a comment or unused variable.",
      ],
      implicatedPaths: ["src/routes/index.tsx"],
      staged: stagedMap,
      starterFiles: [] as GeneratedProjectFile[],
    });

    expect(user).toContain(SITE_TS);
    expect(user).toMatch(/READ-ONLY data source/i);
  });

  it("does not ask the model to re-emit site.ts (read-only reference)", () => {
    const stagedMap = new Map<string, { content: string; path: string }>();
    stagedMap.set("src/content/site.ts", {
      content: SITE_TS,
      path: "src/content/site.ts",
    });
    stagedMap.set("src/routes/index.tsx", {
      content: INDEX_TSX,
      path: "src/routes/index.tsx",
    });

    const { user } = buildTargetedRepairPrompt({
      diagnostics: [
        "src/routes/index.tsx does not render site.testimonials — render it.",
      ],
      implicatedPaths: ["src/routes/index.tsx"],
      staged: stagedMap,
      starterFiles: [] as GeneratedProjectFile[],
    });

    // site.ts must NOT appear in the "Files to re-emit" section.
    const reEmitMatch = user.match(/Files to re-emit[\s\S]*?(?=\n\n|$)/);
    expect(reEmitMatch?.[0]).not.toContain("src/content/site.ts");
  });
});

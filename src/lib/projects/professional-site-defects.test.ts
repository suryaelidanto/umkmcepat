import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  applyProfessionalDefect,
  type ProfessionalDefectDefinition,
} from "./professional-site-defects";

const definitions = JSON.parse(
  readFileSync(
    "src/lib/projects/__fixtures__/professional-defects.json",
    "utf8",
  ),
) as { defects: ProfessionalDefectDefinition[] };

const sourceFiles = [
  {
    path: "src/routes/index.tsx",
    content: `<main className="min-h-dvh bg-background text-foreground"><section data-first-view data-section-id="hero"><p className="font-body text-base text-foreground">{site.businessName}</p><p>{site.offer}</p><a data-primary-action className="text-foreground" href="#">CTA</a></section></main>`,
  },
  { path: "src/index.css", content: ":root { --background: #fff; }" },
];

describe("professional seeded defect operators", () => {
  it("defines exactly 30 defects across all nine categories", () => {
    expect(definitions.defects).toHaveLength(30);
    expect(new Set(definitions.defects.map((defect) => defect.id)).size).toBe(
      30,
    );
    expect(
      new Set(definitions.defects.map((defect) => defect.category)),
    ).toEqual(
      new Set([
        "business_specificity",
        "first_view_hierarchy",
        "content_architecture",
        "composition_rhythm",
        "typography",
        "color_system",
        "media_integrity",
        "mobile_quality",
        "professional_finish",
      ]),
    );
    expect(
      Object.fromEntries(
        [...new Set(definitions.defects.map((defect) => defect.category))].map(
          (category) => [
            category,
            definitions.defects.filter((defect) => defect.category === category)
              .length,
          ],
        ),
      ),
    ).toEqual({
      business_specificity: 3,
      first_view_hierarchy: 4,
      content_architecture: 3,
      composition_rhythm: 4,
      typography: 4,
      color_system: 3,
      media_integrity: 3,
      mobile_quality: 3,
      professional_finish: 3,
    });
  });

  it.each(definitions.defects)(
    "applies $operator as a source-changing transform",
    (defect) => {
      const mutated = applyProfessionalDefect(sourceFiles, defect);
      expect(mutated).not.toEqual(sourceFiles);
    },
  );

  it("rejects an unknown operator before calibration can run", () => {
    expect(() =>
      applyProfessionalDefect(sourceFiles, {
        ...definitions.defects[0]!,
        operator: "unknown",
      }),
    ).toThrow("unknown professional defect operator");
  });
});

import { describe, expect, it } from "vitest";

import { lintGeneratedMarkupAntiSlop } from "./anti-slop-linter";

describe("lintGeneratedMarkupAntiSlop", () => {
  it("passes clean asymmetric layout with minimal card grids", () => {
    const issues = lintGeneratedMarkupAntiSlop([
      {
        path: "src/routes/index.tsx",
        content: `
          export function Home() {
            return (
              <main>
                <section className="py-20 flex flex-col lg:flex-row gap-8">Hero</section>
                <section className="py-20 grid grid-cols-1 md:grid-cols-3 gap-6">Menu</section>
              </main>
            );
          }
        `,
      },
    ]);

    expect(issues).toEqual([]);
  });

  it("flags excessive repetitive card grids (>2 in a file)", () => {
    const issues = lintGeneratedMarkupAntiSlop([
      {
        path: "src/routes/index.tsx",
        content: `
          export function Home() {
            return (
              <div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">1</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">2</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">3</div>
              </div>
            );
          }
        `,
      },
    ]);

    expect(issues.some((i) => i.rule === "excessive_card_grids")).toBe(true);
  });

  it("flags fabricated placeholder testimonial names", () => {
    const issues = lintGeneratedMarkupAntiSlop([
      {
        path: "src/components/site/Reviews.tsx",
        content: `
          export function Reviews() {
            return <p>Kata Budi Santoso: Pelayanan sangat cepat!</p>;
          }
        `,
      },
    ]);

    expect(issues.some((i) => i.rule === "fake_testimonial_placeholders")).toBe(
      true,
    );
  });
});

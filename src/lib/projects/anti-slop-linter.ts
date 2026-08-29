import type { GeneratedProjectFile } from "@/lib/projects/generated-types";

export type AntiSlopIssue = {
  rule:
    | "excessive_card_grids"
    | "consecutive_centered_sections"
    | "decorative_eyebrow_pills"
    | "fake_testimonial_placeholders";
  message: string;
  file: string;
};

export function lintGeneratedMarkupAntiSlop(
  files: GeneratedProjectFile[],
): AntiSlopIssue[] {
  const issues: AntiSlopIssue[] = [];

  for (const file of files) {
    if (!file.path.endsWith(".tsx") && !file.path.endsWith(".jsx")) {
      continue;
    }

    const content = file.content;

    // 1. Check for excessive repeated 3-column or card grids (>2 in a single file)
    const gridMatches = content.match(
      /grid-cols-1\s+md:grid-cols-3|grid-cols-3|\bgrid\s+gap-\d+\s+grid-cols-/g,
    );
    if (gridMatches && gridMatches.length > 2) {
      issues.push({
        rule: "excessive_card_grids",
        message: `File has ${gridMatches.length} card grids. Limit repetitive card grids to at most 2 per page; use asymmetric, editorial, or list layouts.`,
        file: file.path,
      });
    }

    // 2. Check for repetitive decorative eyebrow badges/pills above headings
    const pillBadgeMatches = content.match(
      /<Badge[^>]*>[^<]*<\/Badge>|<span[^>]*rounded-full[^>]*bg-[^>]*>[^<]*<\/span>/gi,
    );
    if (pillBadgeMatches && pillBadgeMatches.length > 3) {
      issues.push({
        rule: "decorative_eyebrow_pills",
        message: `Found ${pillBadgeMatches.length} decorative pills/badges. Restrict floating badge capsules above headings (max 1 in Hero).`,
        file: file.path,
      });
    }

    // 3. Check for fake testimonials / fabricated reviews with generic placeholder names
    if (
      /\b(?:Budi\s+Santoso|Siti\s+Rahma|John\s+Doe|Pelanggan\s+Puas|Anonim)\b/i.test(
        content,
      ) &&
      !file.path.includes("site.ts")
    ) {
      issues.push({
        rule: "fake_testimonial_placeholders",
        message:
          "Detected fabricated placeholder customer name. Testimonials must only come from verified site.ts data.",
        file: file.path,
      });
    }
  }

  return issues;
}

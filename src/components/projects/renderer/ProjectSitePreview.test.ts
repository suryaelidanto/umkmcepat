// src/components/projects/renderer/ProjectSitePreview.test.ts
//
// The unit vitest project (node env) does not include a React renderer, so we
// exercise the renderer's section-gate logic via the pure helper in
// `./sections`. The React component itself is rendered by the Storybook
// browser project for the visual stories. This keeps test coverage for the
// contract (every soft-field section hides cleanly when empty) without adding
// @testing-library/react as a dev dep.

import { describe, expect, it } from "vitest";

import type { ProjectBrief } from "@/lib/projects/brief";

import { defaultBrief } from "@/components/projects/renderer/__fixtures__/default-brief";
import {
  getVisibleSections,
  isSectionVisible,
} from "@/components/projects/renderer/sections";

function baseBrief(over: Partial<ProjectBrief>): ProjectBrief {
  return { ...defaultBrief, ...over };
}

describe("ProjectSitePreview empty-field rendering", () => {
  it("hides the contact section when contact is null", () => {
    const brief = baseBrief({ contact: null });
    expect(isSectionVisible(brief, "contact")).toBe(false);
  });

  it("hides the hours section when hours is null", () => {
    const brief = baseBrief({ hours: null });
    expect(isSectionVisible(brief, "hours")).toBe(false);
  });

  it("hides the testimonials section when testimonials is empty", () => {
    const brief = baseBrief({ testimonials: [] });
    expect(isSectionVisible(brief, "testimonials")).toBe(false);
  });

  it("hides the certifications section when empty", () => {
    const brief = baseBrief({ certifications: [] });
    expect(isSectionVisible(brief, "certifications")).toBe(false);
  });

  it("hides the paymentMethods section when empty", () => {
    const brief = baseBrief({ paymentMethods: [] });
    expect(isSectionVisible(brief, "paymentMethods")).toBe(false);
  });

  it("renders the contact section when present", () => {
    const brief = baseBrief({
      contact: { channel: "whatsapp", value: "08123456789" },
    });
    expect(isSectionVisible(brief, "contact")).toBe(true);
  });

  it("exposes only the populated soft-field sections in a fully blank brief", () => {
    expect(getVisibleSections(defaultBrief)).toEqual([]);
  });
});

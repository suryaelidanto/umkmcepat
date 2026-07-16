// src/components/projects/renderer/sections.ts
// Pure gate logic for the renderer's soft-field sections. Lives outside the
// React component so the unit test project (node env, no jsdom) can exercise
// it without pulling in @testing-library/react.

import type { ProjectBrief } from "@/lib/projects/brief";

export type RendererSectionId =
  | "products"
  | "usp"
  | "since"
  | "address"
  | "deliveryArea"
  | "hours"
  | "contact"
  | "socialLinks"
  | "paymentMethods"
  | "testimonials"
  | "certifications"
  | "currentPromo"
  | "secondaryCta";

function hasContent(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasItems<T>(
  value: readonly T[] | null | undefined,
): value is readonly T[] {
  return Array.isArray(value) && value.length > 0;
}

export function isSectionVisible(
  brief: ProjectBrief,
  id: RendererSectionId,
): boolean {
  switch (id) {
    case "products":
      return hasItems(brief.productOrService);
    case "usp":
      return hasItems(brief.usp);
    case "since":
      return hasContent(brief.since);
    case "address":
      return hasContent(brief.address);
    case "deliveryArea":
      return hasContent(brief.deliveryArea);
    case "hours":
      return hasItems(brief.hours);
    case "contact":
      return brief.contact !== null && brief.contact !== undefined;
    case "socialLinks":
      return hasItems(brief.socialLinks);
    case "paymentMethods":
      return hasItems(brief.paymentMethods);
    case "testimonials":
      return hasItems(brief.testimonials);
    case "certifications":
      return hasItems(brief.certifications);
    case "currentPromo":
      return hasContent(brief.currentPromo);
    case "secondaryCta":
      return brief.secondaryCta !== null && brief.secondaryCta !== undefined;
  }
}

export function getVisibleSections(brief: ProjectBrief): RendererSectionId[] {
  const all: RendererSectionId[] = [
    "products",
    "usp",
    "since",
    "address",
    "deliveryArea",
    "hours",
    "contact",
    "socialLinks",
    "paymentMethods",
    "testimonials",
    "certifications",
    "currentPromo",
    "secondaryCta",
  ];
  return all.filter((id) => isSectionVisible(brief, id));
}

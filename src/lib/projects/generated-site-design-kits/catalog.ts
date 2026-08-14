import type {
  GeneratedSiteDesignKitId,
  GeneratedSiteDesignKitV1,
  GeneratedSiteKitSelectionInput,
} from "./types";
import type { ProjectBriefV2 } from "../canonical-brief";
import type { GeneratedSiteHandoffInput } from "../generated-site-contract";

const commonAntiPatterns = [
  "starter-centered-card-stack",
  "identical-card-grid",
  "technical-component-headings",
  "unbounded-decorative-gradient",
];

const kits: GeneratedSiteDesignKitV1[] = [
  {
    id: "editorial-airy",
    version: 1,
    referenceLabels: ["01"],
    compatibleArchetypes: [
      "service-area",
      "service-online",
      "professional-credibility",
      "generic",
    ],
    compatibleMediaModes: ["graphic", "typographic", "owner_assets"],
    compatibleDensities: ["sparse", "regular"],
    compositionPatterns: [
      {
        id: "editorial-lockup",
        intent:
          "Give the primary promise a calm, readable editorial first view.",
        requires: ["headline", "subheadline", "primaryCta"],
        forbids: ["equal-card-hero", "hero-data-dump"],
      },
      {
        id: "quiet-feature-band",
        intent: "Give one supplied detail a spacious contrast surface.",
        requires: ["offer-or-section"],
        forbids: ["identical-card-grid"],
      },
      {
        id: "split-operational-details",
        intent:
          "Use a restrained split to make supplied logistics easy to scan.",
        requires: ["hours-or-contact-or-delivery"],
        forbids: ["invented-operational-detail"],
      },
    ],
    typography: {
      displayRole: "serif",
      bodyRole: "sans",
      maxDisplayRem: 6,
      maxBodyCh: 68,
    },
    themePolicy: {
      temperature: "warm",
      backgroundLightness: "light",
      accentSurfaceMaximum: 0.1,
    },
    taste: {
      variance: 5,
      motion: 2,
      density: 3,
      shape: "soft",
      typeGuidance:
        "Use a restrained serif display only when it clarifies the business story; keep body copy in a highly readable sans.",
      signatureBudget: 1,
    },
    rhythm: {
      sectionSpacingRem: [4, 8],
      allowAlternatingSurfaces: true,
    },
    primitiveFileIds: ["site-layout-v1"],
    sourceAssertions: [
      "editorial-display-role",
      "airy-section-rhythm",
      "single-feature-band",
    ],
    browserAssertions: [
      "computed-contrast",
      "heading-overflow",
      "content-hidden-by-navigation",
    ],
    criticRubric: [
      "headline feels calm and intentional",
      "whitespace creates hierarchy rather than emptiness",
      "supporting details do not compete with the promise",
    ],
    antiPatterns: commonAntiPatterns,
  },
  {
    id: "menu-led-editorial",
    version: 1,
    referenceLabels: ["02"],
    compatibleArchetypes: ["fnb-menu", "fnb-light"],
    compatibleMediaModes: ["graphic", "typographic", "owner_assets"],
    compatibleDensities: ["regular", "rich"],
    compositionPatterns: [
      {
        id: "centered-offer",
        intent: "Introduce the menu with a focused signature offer and action.",
        requires: ["headline", "products-or-sections"],
        forbids: ["business-name-dash-offer"],
      },
      {
        id: "priced-list",
        intent: "Render supplied menu choices as readable comparison rows.",
        requires: ["products"],
        forbids: ["equal-card-dump"],
      },
      {
        id: "process-band",
        intent:
          "Explain supplied process or order context as a short narrative band.",
        requires: ["sections-or-usp"],
        forbids: ["invented-process-claims"],
      },
      {
        id: "operational-strip",
        intent:
          "Make supplied hours, location, service, or payment details scannable.",
        requires: ["operational-details"],
        forbids: ["invented-hours"],
      },
    ],
    typography: {
      displayRole: "serif",
      bodyRole: "sans",
      maxDisplayRem: 5.5,
      maxBodyCh: 70,
    },
    themePolicy: {
      temperature: "warm",
      backgroundLightness: "light",
      accentSurfaceMaximum: 0.1,
    },
    taste: {
      variance: 4,
      motion: 2,
      density: 5,
      shape: "sharp",
      typeGuidance:
        "Use a clear display/body contrast for scanning choices; never let decorative type compete with menu details or ordering actions.",
      signatureBudget: 1,
    },
    rhythm: {
      sectionSpacingRem: [4, 7],
      allowAlternatingSurfaces: true,
    },
    primitiveFileIds: ["site-layout-v1"],
    sourceAssertions: [
      "menu-row-rhythm",
      "priced-content-visible",
      "operational-detail-band",
    ],
    browserAssertions: [
      "computed-contrast",
      "heading-overflow",
      "touch-target",
    ],
    criticRubric: [
      "menu choices are easier to compare than generic cards",
      "the first view makes the ordering path obvious",
      "operational facts are present without taking over the page",
    ],
    antiPatterns: commonAntiPatterns,
  },
  {
    id: "catalog-story",
    version: 1,
    referenceLabels: ["03"],
    compatibleArchetypes: [
      "retail-catalog",
      "retail-grocery",
      "property-rental",
      "education-course",
    ],
    compatibleMediaModes: ["graphic", "typographic", "owner_assets"],
    compatibleDensities: ["regular", "rich"],
    compositionPatterns: [
      {
        id: "asymmetric-catalog-hero",
        intent:
          "Pair the primary offer with a meaningful visual or data-led counterweight.",
        requires: ["headline", "products-or-offer"],
        forbids: ["centered-placeholder-hero"],
      },
      {
        id: "product-rail",
        intent:
          "Give supplied products a comparison rhythm with clear next actions.",
        requires: ["products"],
        forbids: ["raw-product-json"],
      },
      {
        id: "trust-contrast-band",
        intent:
          "Give supplied trust or USP details a visibly different surface.",
        requires: ["trustPoints-or-usp"],
        forbids: ["four-equal-generic-cards"],
      },
      {
        id: "numbered-process",
        intent:
          "Turn supplied order or process information into a finite sequence.",
        requires: ["sections-or-process"],
        forbids: ["invented-step"],
      },
    ],
    typography: {
      displayRole: "serif",
      bodyRole: "sans",
      maxDisplayRem: 5.75,
      maxBodyCh: 68,
    },
    themePolicy: {
      temperature: "warm",
      backgroundLightness: "light",
      accentSurfaceMaximum: 0.1,
    },
    taste: {
      variance: 6,
      motion: 2,
      density: 5,
      shape: "soft",
      typeGuidance:
        "Give the catalog one confident display voice and a calm sans for product comparison; vary scale and surface instead of repeating cards.",
      signatureBudget: 1,
    },
    rhythm: {
      sectionSpacingRem: [4, 8],
      allowAlternatingSurfaces: true,
    },
    primitiveFileIds: ["site-layout-v1"],
    sourceAssertions: [
      "asymmetric-hero",
      "product-comparison-rhythm",
      "contrast-trust-band",
    ],
    browserAssertions: [
      "computed-contrast",
      "heading-overflow",
      "horizontal-overflow",
      "primary-cta",
    ],
    criticRubric: [
      "the catalog is the visual center of gravity",
      "rich content has a story rhythm instead of a card dump",
      "media-free treatment still feels complete and useful",
    ],
    antiPatterns: commonAntiPatterns,
  },
  {
    id: "warm-commerce",
    version: 1,
    referenceLabels: ["04"],
    compatibleArchetypes: ["retail", "retail-catalog", "service-appointment"],
    compatibleMediaModes: ["graphic", "typographic", "owner_assets"],
    compatibleDensities: ["regular", "rich"],
    compositionPatterns: [
      {
        id: "split-commerce-hero",
        intent:
          "Use a compact split hero to pair the promise and shopping context.",
        requires: ["headline", "offer", "primaryCta"],
        forbids: ["generic-gradient-hero"],
      },
      {
        id: "compact-product-grid",
        intent:
          "Use varied compact product surfaces when comparison is genuinely useful.",
        requires: ["products"],
        forbids: ["same-card-everywhere"],
      },
      {
        id: "info-triad",
        intent: "Group three supplied decision aids without inventing proof.",
        requires: ["trust-or-operational-details"],
        forbids: ["invented-guarantee"],
      },
      {
        id: "contrast-order-close",
        intent:
          "Close with a high-contrast action surface and the accepted CTA.",
        requires: ["primaryCta"],
        forbids: ["fake-checkout"],
      },
    ],
    typography: {
      displayRole: "serif",
      bodyRole: "sans",
      maxDisplayRem: 5.5,
      maxBodyCh: 68,
    },
    themePolicy: {
      temperature: "warm",
      backgroundLightness: "light",
      accentSurfaceMaximum: 0.1,
    },
    taste: {
      variance: 5,
      motion: 2,
      density: 4,
      shape: "soft",
      typeGuidance:
        "Use one warm, legible display treatment for the offer and a steady sans for decisions; the shopping path matters more than decoration.",
      signatureBudget: 1,
    },
    rhythm: {
      sectionSpacingRem: [3.5, 7],
      allowAlternatingSurfaces: true,
    },
    primitiveFileIds: ["site-layout-v1"],
    sourceAssertions: [
      "commerce-split-hero",
      "varied-product-surfaces",
      "contrast-action-close",
    ],
    browserAssertions: [
      "computed-contrast",
      "heading-overflow",
      "touch-target",
      "primary-cta",
    ],
    criticRubric: [
      "warmth comes from the system, not decorative noise",
      "the page feels shoppable without pretending to be checkout",
      "the closing action is unmistakable and trustworthy",
    ],
    antiPatterns: commonAntiPatterns,
  },
  {
    id: "bold-typographic",
    version: 1,
    referenceLabels: ["07"],
    compatibleArchetypes: [
      "generic",
      "community-group",
      "event-promo",
      "agri-produce",
      "service-area",
      "service-online",
    ],
    compatibleMediaModes: ["graphic", "typographic", "owner_assets"],
    compatibleDensities: ["sparse", "regular"],
    compositionPatterns: [
      {
        id: "full-field-lockup",
        intent: "Let one bold typographic statement carry a sparse page.",
        requires: ["headline", "subheadline"],
        forbids: ["content-dump", "fake-proof-grid"],
      },
      {
        id: "high-contrast-actions",
        intent: "Pair two clearly differentiated actions below the promise.",
        requires: ["primaryCta"],
        forbids: ["tiny-cta"],
      },
      {
        id: "minimal-proof-line",
        intent:
          "Use one concise supplied proof detail without padding the page.",
        requires: ["offer-or-trust"],
        forbids: ["invented-testimonial"],
      },
    ],
    typography: {
      displayRole: "sans",
      bodyRole: "sans",
      maxDisplayRem: 5.5,
      maxBodyCh: 64,
    },
    themePolicy: {
      temperature: "cool",
      backgroundLightness: "dark",
      accentSurfaceMaximum: 0.1,
    },
    taste: {
      variance: 7,
      motion: 2,
      density: 3,
      shape: "sharp",
      typeGuidance:
        "Let a single sans display voice carry the statement; use weight, scale, and space for character instead of novelty fonts or effects.",
      signatureBudget: 1,
    },
    rhythm: {
      sectionSpacingRem: [3, 6],
      allowAlternatingSurfaces: false,
    },
    primitiveFileIds: ["site-layout-v1"],
    sourceAssertions: [
      "bold-display-role",
      "high-contrast-action-pair",
      "sparse-content-respected",
    ],
    browserAssertions: [
      "computed-contrast",
      "heading-overflow",
      "primary-cta",
      "touch-target",
    ],
    criticRubric: [
      "minimal content feels intentional rather than unfinished",
      "bold type remains readable on mobile",
      "high contrast does not become unreadable or generic",
    ],
    antiPatterns: commonAntiPatterns,
  },
];

export const DESIGN_KITS = new Map<
  GeneratedSiteDesignKitId,
  GeneratedSiteDesignKitV1
>(kits.map((kit) => [kit.id, kit]));

export function deriveGeneratedSiteKitSelectionInput(
  input: GeneratedSiteKitSelectionInput,
): GeneratedSiteKitSelectionInput;
export function deriveGeneratedSiteKitSelectionInput(input: {
  handoff: GeneratedSiteHandoffInput;
  briefSnapshot: ProjectBriefV2;
  photoEnabled: boolean;
}): GeneratedSiteKitSelectionInput;
export function deriveGeneratedSiteKitSelectionInput(
  input:
    | GeneratedSiteKitSelectionInput
    | {
        handoff: GeneratedSiteHandoffInput;
        briefSnapshot: ProjectBriefV2;
        photoEnabled: boolean;
      },
): GeneratedSiteKitSelectionInput {
  if ("handoff" in input) {
    const { handoff, briefSnapshot, photoEnabled } = input;
    const primaryCta = handoff.contract.ctaIntents[0];
    const mediaMode =
      photoEnabled && handoff.contract.assets.length > 0
        ? "owner_assets"
        : "graphic";
    return {
      archetype: handoff.plan.archetype,
      density:
        briefSnapshot.offers.length > 2
          ? "rich"
          : briefSnapshot.offers.length === 0
            ? "sparse"
            : "regular",
      mediaMode,
      primaryJobKind: handoff.plan.capabilities.includes("catalog")
        ? "browse"
        : primaryCta?.kind === "visit" ||
            handoff.plan.capabilities.includes("location")
          ? "visit"
          : primaryCta?.kind === "book"
            ? "book"
            : "inquire",
      hasOperationalDetails:
        briefSnapshot.content.hours.length > 0 ||
        Boolean(briefSnapshot.content.address) ||
        Boolean(briefSnapshot.content.deliveryArea),
    };
  }
  return {
    archetype: input.archetype,
    density: input.density,
    mediaMode: input.mediaMode,
    primaryJobKind: input.primaryJobKind,
    hasOperationalDetails: input.hasOperationalDetails,
  };
}

export function selectGeneratedSiteDesignKit(
  input: GeneratedSiteKitSelectionInput,
): GeneratedSiteDesignKitV1 {
  if (
    (input.archetype === "generic" || input.archetype === "event-promo") &&
    input.density === "sparse" &&
    !input.hasOperationalDetails
  ) {
    return requireKit("bold-typographic");
  }
  const direct = kits.find(
    (kit) =>
      kit.compatibleArchetypes.includes(input.archetype) &&
      kit.compatibleMediaModes.includes(input.mediaMode) &&
      kit.compatibleDensities.includes(input.density),
  );
  if (direct) {
    return direct;
  }
  if (
    input.archetype.startsWith("retail") ||
    input.archetype === "property-rental"
  ) {
    return requireKit("catalog-story");
  }
  if (input.archetype.startsWith("fnb")) {
    return requireKit("menu-led-editorial");
  }
  if (input.density === "sparse" && !input.hasOperationalDetails) {
    return requireKit("bold-typographic");
  }
  return requireKit("editorial-airy");
}

function requireKit(id: GeneratedSiteDesignKitId): GeneratedSiteDesignKitV1 {
  const kit = DESIGN_KITS.get(id);
  if (!kit) {
    throw new Error(`generated-site design kit missing: ${id}`);
  }
  return kit;
}

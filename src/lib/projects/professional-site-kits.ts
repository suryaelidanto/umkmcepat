import type {
  GeneratedSiteDesignKitId,
  GeneratedSiteDesignKitV1,
  GeneratedSiteKitDensity,
  GeneratedSiteKitMediaMode,
  GeneratedSiteTasteProfile,
} from "./generated-site-design-kits/types";

export type { GeneratedSiteDesignKitId } from "./generated-site-design-kits/types";

export type ProfessionalContentRole =
  | "identity"
  | "offer"
  | "catalog"
  | "proof"
  | "process"
  | "operations"
  | "story"
  | "faq"
  | "contact";

export type ProfessionalFontStackId =
  "editorial-serif" | "humanist-sans" | "geometric-sans" | "restrained-grotesk";

export type ProfessionalCompositionPattern = {
  id: string;
  intent: string;
  requiredContentRoles: ProfessionalContentRole[];
  allowedMediaModes: GeneratedSiteKitMediaMode[];
  desktopRelationship:
    "centered" | "split" | "asymmetric" | "rail" | "editorial-list";
  requiredMobileTransform: string;
  forbids: string[];
};

export type GeneratedSiteDesignKitV2 = Omit<
  GeneratedSiteDesignKitV1,
  | "version"
  | "compositionPatterns"
  | "typography"
  | "primitiveFileIds"
  | "rhythm"
> & {
  version: 2;
  compositionPatterns: ProfessionalCompositionPattern[];
  typography: {
    allowedDisplayStackIds: ProfessionalFontStackId[];
    bodyStackId: ProfessionalFontStackId;
    maxDisplayRem: number;
    maxBodyCh: number;
  };
  primitiveFileIds: ["site-layout-v2"];
  rhythm: {
    sectionSpacingRem: [number, number];
    allowAlternatingSurfaces: boolean;
    maximumConsecutiveEqualTreatments: 2;
  };
  allowedSectionTreatments: string[];
  allowedSignatureAnchors: Array<
    "offer" | "product" | "process" | "place" | "craft" | "audience"
  >;
  sourceAssertions: string[];
  browserAssertions: string[];
  criticRubric: string[];
  antiPatterns: string[];
  taste: GeneratedSiteTasteProfile;
};

export type ProfessionalSiteSelectionInput = {
  archetype: string;
  density: GeneratedSiteKitDensity;
  mediaMode: GeneratedSiteKitMediaMode;
  hasOperationalDetails: boolean;
  routeRoles: Array<{
    path: string;
    roles: ProfessionalContentRole[];
  }>;
};

const PROFESSIONAL_REVIEW_RUBRIC_LABELS = [
  "business specificity",
  "first-view hierarchy",
  "content architecture",
  "composition rhythm",
  "typography",
  "color system",
  "media integrity",
  "mobile quality",
  "professional finish",
] as const;

const commonAntiPatterns = [
  "starter-centered-card-stack",
  "identical-card-grid",
  "technical-component-headings",
  "generic-purple-blue-gradient",
  "repeated-decorative-eyebrow",
];

const kits: GeneratedSiteDesignKitV2[] = [
  {
    id: "editorial-airy",
    version: 2,
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
        intent: "Lead with a calm business promise and a single useful action.",
        requiredContentRoles: ["identity", "offer"],
        allowedMediaModes: ["graphic", "typographic", "owner_assets"],
        desktopRelationship: "asymmetric",
        requiredMobileTransform:
          "Keep identity, offer, primary action, and the signature detail in that order.",
        forbids: ["equal-card-hero", "hero-data-dump"],
      },
      {
        id: "operational-editorial-split",
        intent:
          "Give accepted operational details a quiet, readable counterpoint.",
        requiredContentRoles: ["offer", "operations"],
        allowedMediaModes: ["graphic", "typographic", "owner_assets"],
        desktopRelationship: "split",
        requiredMobileTransform:
          "Place the offer before operational details; do not compress the columns side by side.",
        forbids: ["invented-operational-detail", "equal-card-grid"],
      },
    ],
    typography: {
      allowedDisplayStackIds: ["editorial-serif"],
      bodyStackId: "humanist-sans",
      maxDisplayRem: 5.75,
      maxBodyCh: 68,
    },
    themePolicy: {
      temperature: "warm",
      backgroundLightness: "light",
      accentSurfaceMaximum: 0.1,
    },
    taste: {
      variance: 4,
      motion: 2,
      density: 3,
      shape: "soft",
      typeGuidance:
        "Use a restrained editorial display and a highly readable body stack so the business promise has room to breathe.",
      signatureBudget: 1,
    },
    rhythm: {
      sectionSpacingRem: [4, 8],
      allowAlternatingSurfaces: true,
      maximumConsecutiveEqualTreatments: 2,
    },
    primitiveFileIds: ["site-layout-v2"],
    allowedSectionTreatments: [
      "editorial-lockup",
      "quiet-feature-band",
      "operational-detail-split",
      "restrained-close",
    ],
    allowedSignatureAnchors: ["offer", "process", "audience"],
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
    criticRubric: PROFESSIONAL_REVIEW_RUBRIC_LABELS.map(
      (label) => `${label}: preserve the calm editorial hierarchy`,
    ),
    antiPatterns: [...commonAntiPatterns, "uniform-section-spacing"],
  },
  {
    id: "menu-led-editorial",
    version: 2,
    referenceLabels: ["02"],
    compatibleArchetypes: ["fnb-menu", "fnb-light"],
    compatibleMediaModes: ["graphic", "typographic", "owner_assets"],
    compatibleDensities: ["regular", "rich"],
    compositionPatterns: [
      {
        id: "menu-led-first-view",
        intent:
          "Make the menu choice and ordering action the first useful decision.",
        requiredContentRoles: ["identity", "catalog"],
        allowedMediaModes: ["graphic", "typographic", "owner_assets"],
        desktopRelationship: "editorial-list",
        requiredMobileTransform:
          "Show the headline, ordering action, and first menu choices before secondary details.",
        forbids: ["equal-card-dump", "decorative-menu-only"],
      },
      {
        id: "operational-menu-close",
        intent:
          "Close the menu with accepted operations and a real contact action.",
        requiredContentRoles: ["catalog", "operations", "contact"],
        allowedMediaModes: ["graphic", "typographic", "owner_assets"],
        desktopRelationship: "split",
        requiredMobileTransform:
          "Stack menu, operational facts, and contact in a scan-friendly order.",
        forbids: ["invented-hours", "fake-checkout"],
      },
    ],
    typography: {
      allowedDisplayStackIds: ["humanist-sans"],
      bodyStackId: "humanist-sans",
      maxDisplayRem: 5.25,
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
      density: 6,
      shape: "sharp",
      typeGuidance:
        "Use a clear display and body system for fast menu scanning; decorative type must never compete with the ordering action.",
      signatureBudget: 1,
    },
    rhythm: {
      sectionSpacingRem: [4, 7],
      allowAlternatingSurfaces: true,
      maximumConsecutiveEqualTreatments: 2,
    },
    primitiveFileIds: ["site-layout-v2"],
    allowedSectionTreatments: [
      "menu-led-list",
      "choice-row",
      "operational-band",
      "order-close",
    ],
    allowedSignatureAnchors: ["offer", "product", "process"],
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
    criticRubric: PROFESSIONAL_REVIEW_RUBRIC_LABELS.map(
      (label) => `${label}: keep choices scannable and ordering clear`,
    ),
    antiPatterns: [...commonAntiPatterns, "filler-menu-section"],
  },
  {
    id: "catalog-story",
    version: 2,
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
          "Let the offer lead while a meaningful catalog preview carries visual weight.",
        requiredContentRoles: ["identity", "offer", "catalog"],
        allowedMediaModes: ["owner_assets", "graphic"],
        desktopRelationship: "asymmetric",
        requiredMobileTransform:
          "Place the offer and primary action before the compact catalog preview.",
        forbids: ["centered-placeholder-hero", "empty-product-frame"],
      },
      {
        id: "catalog-narrative-rail",
        intent:
          "Give a rich catalog a vertical rhythm with accepted story context.",
        requiredContentRoles: ["catalog", "story"],
        allowedMediaModes: ["owner_assets", "graphic", "typographic"],
        desktopRelationship: "rail",
        requiredMobileTransform:
          "Use an ordered vertical rail and place accepted story details between product groups.",
        forbids: ["raw-product-json", "same-card-everywhere"],
      },
    ],
    typography: {
      allowedDisplayStackIds: ["editorial-serif", "geometric-sans"],
      bodyStackId: "humanist-sans",
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
      density: 6,
      shape: "soft",
      typeGuidance:
        "Give the catalog a confident display voice and a calm comparison stack; vary scale and surface instead of repeating cards.",
      signatureBudget: 1,
    },
    rhythm: {
      sectionSpacingRem: [4, 8],
      allowAlternatingSurfaces: true,
      maximumConsecutiveEqualTreatments: 2,
    },
    primitiveFileIds: ["site-layout-v2"],
    allowedSectionTreatments: [
      "asymmetric-catalog",
      "catalog-rail",
      "story-band",
      "catalog-close",
    ],
    allowedSignatureAnchors: ["product", "craft", "place"],
    sourceAssertions: [
      "asymmetric-hero",
      "product-comparison-rhythm",
      "catalog-story-rail",
    ],
    browserAssertions: [
      "computed-contrast",
      "heading-overflow",
      "horizontal-overflow",
      "primary-cta",
    ],
    criticRubric: PROFESSIONAL_REVIEW_RUBRIC_LABELS.map(
      (label) => `${label}: make the supplied catalog feel specific and useful`,
    ),
    antiPatterns: [...commonAntiPatterns, "catalog-card-wall"],
  },
  {
    id: "warm-commerce",
    version: 2,
    referenceLabels: ["04"],
    compatibleArchetypes: ["retail", "retail-catalog", "service-appointment"],
    compatibleMediaModes: ["graphic", "typographic", "owner_assets"],
    compatibleDensities: ["regular", "rich"],
    compositionPatterns: [
      {
        id: "split-commerce-hero",
        intent:
          "Pair a concrete offer with the next decision without pretending to be checkout.",
        requiredContentRoles: ["identity", "offer", "contact"],
        allowedMediaModes: ["owner_assets", "graphic", "typographic"],
        desktopRelationship: "split",
        requiredMobileTransform:
          "Place promise, primary action, and decision aid in that order before secondary detail.",
        forbids: ["generic-gradient-hero", "fake-checkout"],
      },
      {
        id: "decision-aid-close",
        intent:
          "Use accepted proof and contact details as a trustworthy closing decision aid.",
        requiredContentRoles: ["proof", "contact"],
        allowedMediaModes: ["owner_assets", "graphic", "typographic"],
        desktopRelationship: "split",
        requiredMobileTransform:
          "Place accepted proof before the close action and keep the action reachable.",
        forbids: ["invented-guarantee", "urgent-badge"],
      },
    ],
    typography: {
      allowedDisplayStackIds: ["geometric-sans"],
      bodyStackId: "humanist-sans",
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
      density: 5,
      shape: "soft",
      typeGuidance:
        "Use a warm, legible display treatment for the offer and a steady body stack for decisions; the customer path matters more than decoration.",
      signatureBudget: 1,
    },
    rhythm: {
      sectionSpacingRem: [3.5, 7],
      allowAlternatingSurfaces: true,
      maximumConsecutiveEqualTreatments: 2,
    },
    primitiveFileIds: ["site-layout-v2"],
    allowedSectionTreatments: [
      "commerce-split",
      "decision-aid",
      "compact-offer-list",
      "contrast-close",
    ],
    allowedSignatureAnchors: ["offer", "product", "audience"],
    sourceAssertions: [
      "commerce-split-hero",
      "varied-decision-surfaces",
      "contrast-action-close",
    ],
    browserAssertions: [
      "computed-contrast",
      "heading-overflow",
      "touch-target",
      "primary-cta",
    ],
    criticRubric: PROFESSIONAL_REVIEW_RUBRIC_LABELS.map(
      (label) => `${label}: keep commerce warm, specific, and honest`,
    ),
    antiPatterns: [...commonAntiPatterns, "checkout-imitation"],
  },
  {
    id: "bold-typographic",
    version: 2,
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
        requiredContentRoles: ["identity", "offer"],
        allowedMediaModes: ["graphic", "typographic", "owner_assets"],
        desktopRelationship: "centered",
        requiredMobileTransform:
          "Keep the display under four lines and keep the primary action within the first view.",
        forbids: ["content-dump", "fake-proof-grid"],
      },
      {
        id: "minimal-proof-line",
        intent:
          "Follow the primary action with one concise accepted proof detail.",
        requiredContentRoles: ["offer", "proof"],
        allowedMediaModes: ["graphic", "typographic", "owner_assets"],
        desktopRelationship: "editorial-list",
        requiredMobileTransform:
          "Place the accepted proof immediately after the action without padding the page.",
        forbids: ["invented-testimonial", "numbered-scaffolding"],
      },
    ],
    typography: {
      allowedDisplayStackIds: ["restrained-grotesk"],
      bodyStackId: "restrained-grotesk",
      maxDisplayRem: 5.25,
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
        "Let a single sans display voice carry the statement; use weight, scale, and space for character instead of novelty effects.",
      signatureBudget: 1,
    },
    rhythm: {
      sectionSpacingRem: [3, 6],
      allowAlternatingSurfaces: false,
      maximumConsecutiveEqualTreatments: 2,
    },
    primitiveFileIds: ["site-layout-v2"],
    allowedSectionTreatments: [
      "full-field-lockup",
      "action-line",
      "minimal-proof",
      "quiet-close",
    ],
    allowedSignatureAnchors: ["offer", "audience", "craft"],
    sourceAssertions: [
      "bold-display-role",
      "high-contrast-action",
      "sparse-content-respected",
    ],
    browserAssertions: [
      "computed-contrast",
      "heading-overflow",
      "primary-cta",
      "touch-target",
    ],
    criticRubric: PROFESSIONAL_REVIEW_RUBRIC_LABELS.map(
      (label) =>
        `${label}: respect sparse bold minimalism without losing clarity`,
    ),
    antiPatterns: [...commonAntiPatterns, "minimalism-rejected-as-empty"],
  },
];

export const PROFESSIONAL_DESIGN_KITS: ReadonlyMap<
  GeneratedSiteDesignKitId,
  GeneratedSiteDesignKitV2
> = new Map(kits.map((kit) => [kit.id, kit]));

export function compatibleProfessionalPatterns(input: {
  kit: GeneratedSiteDesignKitV2;
  contentRoles: ProfessionalContentRole[];
  mediaMode: GeneratedSiteKitMediaMode;
}): ProfessionalCompositionPattern[] {
  const roles = new Set(input.contentRoles);
  return input.kit.compositionPatterns.filter(
    (pattern) =>
      pattern.allowedMediaModes.includes(input.mediaMode) &&
      pattern.requiredContentRoles.every((role) => roles.has(role)),
  );
}

export function selectProfessionalSiteKit(
  input: ProfessionalSiteSelectionInput,
): GeneratedSiteDesignKitV2 {
  if (input.routeRoles.length === 0) {
    throw new Error("professional site requires at least one route");
  }

  const candidates = kits.filter(
    (kit) =>
      kit.compatibleArchetypes.includes(input.archetype) &&
      kit.compatibleMediaModes.includes(input.mediaMode) &&
      kit.compatibleDensities.includes(input.density) &&
      input.routeRoles.every(
        (route) =>
          compatibleProfessionalPatterns({
            kit,
            contentRoles: route.roles,
            mediaMode: input.mediaMode,
          }).length > 0,
      ),
  );

  if (candidates.length === 0) {
    throw new Error("no compatible professional site kit");
  }

  const preferredId = input.archetype.startsWith("fnb")
    ? "menu-led-editorial"
    : input.archetype === "property-rental" ||
        input.archetype.startsWith("retail-catalog")
      ? "catalog-story"
      : input.archetype === "retail" ||
          input.archetype === "service-appointment"
        ? "warm-commerce"
        : input.density === "sparse" && !input.hasOperationalDetails
          ? "bold-typographic"
          : "editorial-airy";

  return candidates.find((kit) => kit.id === preferredId) ?? candidates[0];
}

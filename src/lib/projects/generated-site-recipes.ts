import type { GeneratedSiteMediaMode } from "./generated-site-contract";

export type GeneratedSiteRecipeV1 = {
  id: string;
  version: 1;
  compatibleArchetypes: string[];
  composition: string;
  hierarchy: string[];
  preferredPatterns: string[];
  avoidPatterns: string[];
  mediaGuidance: Record<GeneratedSiteMediaMode, string>;
  imageBenefiting: boolean;
  requiredBrowserAssertions: string[];
  riskTags: string[];
};

export type GeneratedSiteGoldExample = {
  id: string;
  version: 1;
  recipeId: string;
  mediaModes: GeneratedSiteMediaMode[];
  source: string;
  forbiddenLiterals: string[];
};

const mediaGuidance: Record<GeneratedSiteMediaMode, string> = {
  owner_assets:
    "Use only approved /media/<assetId> assets for their declared purpose.",
  replaceable_slots:
    "Use local replaceable slots only where imagery materially improves comprehension.",
  graphic:
    "Build a complete image-free composition using typography, geometry, icons, and data.",
  typographic:
    "Let type, spacing, contrast, and content hierarchy carry the complete page.",
};

const sharedAvoid = [
  "starter-centered-card-stack",
  "identical-card-grid",
  "technical-component-headings",
];

const sharedAssertions = [
  "primary CTA is visible",
  "no horizontal overflow",
  "required content is visible",
];

const recipes: GeneratedSiteRecipeV1[] = [
  {
    id: "retail-catalog",
    version: 1,
    compatibleArchetypes: ["retail", "retail-catalog", "retail-grocery"],
    composition:
      "Catalog-first hierarchy with a decisive offer, comparison rhythm, trust strip, and direct purchase action.",
    hierarchy: [
      "offer and CTA",
      "catalog comparison",
      "purchase confidence",
      "objection handling",
    ],
    preferredPatterns: [
      "asymmetric retail hero",
      "comparison rows",
      "trust strip",
    ],
    avoidPatterns: sharedAvoid,
    mediaGuidance,
    imageBenefiting: true,
    requiredBrowserAssertions: sharedAssertions,
    riskTags: ["image_led", "content_density"],
  },
  {
    id: "fnb-menu",
    version: 1,
    compatibleArchetypes: ["fnb-menu", "fnb-light"],
    composition:
      "Menu-first page with ordering context, operational details, and one clear contact path.",
    hierarchy: [
      "signature offer",
      "menu choices",
      "hours and location",
      "order action",
    ],
    preferredPatterns: ["menu board", "featured item", "operational strip"],
    avoidPatterns: sharedAvoid,
    mediaGuidance,
    imageBenefiting: true,
    requiredBrowserAssertions: sharedAssertions,
    riskTags: ["image_led"],
  },
  {
    id: "service-area",
    version: 1,
    compatibleArchetypes: ["service-area", "health-beauty"],
    composition:
      "Service-first page that clarifies scope, coverage area, proof, and contact action.",
    hierarchy: [
      "service promise",
      "service options",
      "coverage and proof",
      "contact action",
    ],
    preferredPatterns: ["service menu", "coverage band", "process narrative"],
    avoidPatterns: sharedAvoid,
    mediaGuidance,
    imageBenefiting: false,
    requiredBrowserAssertions: sharedAssertions,
    riskTags: [],
  },
  {
    id: "service-appointment",
    version: 1,
    compatibleArchetypes: ["service-appointment"],
    composition:
      "Appointment page centered on service choice, duration or availability facts, and booking intent.",
    hierarchy: [
      "service and booking CTA",
      "service details",
      "practitioner or process proof",
      "booking action",
    ],
    preferredPatterns: [
      "appointment rail",
      "service comparison",
      "booking close",
    ],
    avoidPatterns: sharedAvoid,
    mediaGuidance,
    imageBenefiting: false,
    requiredBrowserAssertions: sharedAssertions,
    riskTags: [],
  },
  {
    id: "service-online",
    version: 1,
    compatibleArchetypes: [
      "service-online",
      "professional-credibility",
      "creative-portfolio",
    ],
    composition:
      "Credibility-first page with a focused promise, selected work or outcomes, process, and inquiry action.",
    hierarchy: [
      "expert promise",
      "selected evidence",
      "working process",
      "inquiry action",
    ],
    preferredPatterns: [
      "case highlight",
      "capability list",
      "process narrative",
    ],
    avoidPatterns: sharedAvoid,
    mediaGuidance,
    imageBenefiting: false,
    requiredBrowserAssertions: sharedAssertions,
    riskTags: ["business_fit"],
  },
  {
    id: "property-rental",
    version: 1,
    compatibleArchetypes: ["property-rental"],
    composition:
      "Inventory-first property page with unit comparison, location context, and availability inquiry.",
    hierarchy: [
      "available units",
      "unit comparison",
      "location and access",
      "availability inquiry",
    ],
    preferredPatterns: ["unit rail", "location band", "availability close"],
    avoidPatterns: sharedAvoid,
    mediaGuidance,
    imageBenefiting: true,
    requiredBrowserAssertions: sharedAssertions,
    riskTags: ["image_led"],
  },
  {
    id: "education-course",
    version: 1,
    compatibleArchetypes: ["education-course"],
    composition:
      "Learning-outcome page with program structure, instructor proof, schedule facts, and enrollment intent.",
    hierarchy: [
      "learning outcome",
      "program structure",
      "proof and logistics",
      "enrollment action",
    ],
    preferredPatterns: [
      "curriculum timeline",
      "outcome band",
      "enrollment close",
    ],
    avoidPatterns: sharedAvoid,
    mediaGuidance,
    imageBenefiting: false,
    requiredBrowserAssertions: sharedAssertions,
    riskTags: ["content_density"],
  },
  {
    id: "generic",
    version: 1,
    compatibleArchetypes: [
      "generic",
      "community-group",
      "event-promo",
      "agri-produce",
    ],
    composition:
      "Job-first page whose structure follows supplied content and one primary action without generic filler.",
    hierarchy: [
      "identity and job",
      "useful supplied details",
      "trust",
      "primary action",
    ],
    preferredPatterns: ["content-led hero", "evidence band", "direct close"],
    avoidPatterns: sharedAvoid,
    mediaGuidance,
    imageBenefiting: false,
    requiredBrowserAssertions: sharedAssertions,
    riskTags: ["business_fit"],
  },
];

const recipeByArchetype = new Map<string, GeneratedSiteRecipeV1>();
for (const recipe of recipes) {
  for (const archetype of recipe.compatibleArchetypes) {
    recipeByArchetype.set(archetype, recipe);
  }
}

const examples: GeneratedSiteGoldExample[] = recipes.flatMap((recipe) => {
  const modes: GeneratedSiteMediaMode[] = recipe.imageBenefiting
    ? ["graphic", "typographic", "replaceable_slots", "owner_assets"]
    : ["graphic", "typographic", "owner_assets"];
  return [
    {
      id: `${recipe.id}-v1`,
      version: 1 as const,
      recipeId: recipe.id,
      mediaModes: modes,
      source: `<main className="min-h-dvh bg-background text-foreground"><section className="px-6 py-16 md:px-12 md:py-24"><h1 className="max-w-4xl text-balance text-5xl font-semibold tracking-[-0.03em] md:text-7xl">{site.headline}</h1><p className="mt-5 max-w-2xl text-pretty text-muted-foreground">{site.subheadline}</p></section><section className="border-t border-border px-6 py-12 md:px-12">{/* Compose supplied content according to the selected recipe. */}</section></main>`,
      forbiddenLiterals: ["Example Business", "Lorem ipsum"],
    },
  ];
});

export function selectGeneratedSiteRecipe(
  archetype: string,
): GeneratedSiteRecipeV1 {
  return recipeByArchetype.get(archetype) ?? recipeByArchetype.get("generic")!;
}

export function selectGeneratedSiteGoldExample(input: {
  recipeId: string;
  mediaMode: GeneratedSiteMediaMode;
}): GeneratedSiteGoldExample {
  const example = examples.find(
    (item) =>
      item.recipeId === input.recipeId &&
      item.mediaModes.includes(input.mediaMode),
  );
  if (!example) {
    throw new Error(
      `generated-site gold example missing: ${input.recipeId}/${input.mediaMode}`,
    );
  }
  return example;
}

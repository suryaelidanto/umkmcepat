import { createHash } from "node:crypto";

import { canonicalJson } from "./build-hash";
import {
  classifyProfessionalContentRole,
  deriveProfessionalRouteRoles,
  deriveProfessionalRouteRolesFromObligations,
  type GeneratedSiteWriterContractV3,
  type ProfessionalContentPath,
  type ProfessionalSiteContentV1,
  type ProfessionalRouteRoleInput,
} from "./generated-site-contract";
import {
  compatibleProfessionalPatterns,
  type GeneratedSiteDesignKitV2,
  type ProfessionalContentRole,
  type ProfessionalFontStackId,
} from "./professional-site-kits";

import type { ContractFactV1, FactKind } from "./build-contract";
import type { GeneratedSiteKitMediaMode } from "./generated-site-design-kits/types";

export type ProfessionalBlueprintArtDirection = {
  subject: string;
  audience: string | null;
  acceptedDirection: string | null;
  variance: number;
  motion: number;
  density: number;
  shape: "sharp" | "soft" | "pill";
  typography: {
    allowedDisplayStackIds: ProfessionalFontStackId[];
    bodyStackId: ProfessionalFontStackId;
    maxDisplayRem: number;
    maxBodyCh: number;
  };
  palette: {
    backgroundLightness: "light" | "dark" | "either";
    temperature: "warm" | "cool" | "neutral";
    accentSurfaceMaximum: number;
  };
  rhythm: {
    sectionSpacingRem: [number, number];
    allowAlternatingSurfaces: boolean;
    maximumConsecutiveEqualTreatments: 2;
  };
  signature: {
    budget: 1;
    mustReference: Array<
      "offer" | "product" | "process" | "place" | "craft" | "audience"
    >;
    forbidden: string[];
  };
};

export type ProfessionalRouteBinding = {
  path: string;
  filePath: string;
  exportName: string;
  purpose: string;
  primaryJob: string;
  requiredFactIds: string[];
  requiredContentPaths: ProfessionalContentPath[];
  firstView: {
    identityText: string;
    offerTexts: string[];
    primaryCtaLabel: string;
    primaryCtaHref: string;
  };
  allowedPatternIds: string[];
  sections: Array<{
    id: string;
    purpose: string;
    role: ProfessionalContentRole;
    requiredFactIds: string[];
    requiredContentPaths: ProfessionalContentPath[];
    requiredVisibleTexts: string[];
  }>;
};

export type ProfessionalSiteBlueprintV1 = {
  schemaVersion: 1;
  blueprintHash: string;
  contractHash: string;
  kit: {
    id: GeneratedSiteDesignKitV2["id"];
    version: 2;
    allowedPatternIds: string[];
  };
  pageStrategy: {
    mode: "single" | "multi";
    reason: "single-primary-job" | "distinct-customer-jobs";
    routeCount: number;
  };
  contentDepth: {
    density: "sparse" | "regular" | "rich";
    suppliedFactCount: number;
    omissionPolicy: "omit-unsupported-sections";
  };
  firstView: {
    requiredRoles: ["identity", "offer", "primary-action"];
  };
  signatureRoute: string;
  artDirection: ProfessionalBlueprintArtDirection;
  media: GeneratedSiteWriterContractV3["media"];
  routes: ProfessionalRouteBinding[];
  responsive: {
    mobileViewport: { width: 390; height: 844 };
    desktopViewport: { width: 1440; height: 1000 };
    requireExplicitTransformFor: string[];
    primaryActionVisibleOnMobile: true;
  };
};

export function contentBindingForFact(input: {
  fact: ContractFactV1;
  content: ProfessionalSiteContentV1;
}): { paths: ProfessionalContentPath[]; visibleTexts: string[] } {
  const { fact, content } = input;
  switch (fact.kind) {
    case "offer":
      return {
        paths: ["site.offers"],
        visibleTexts: content.offers.flatMap((offer) =>
          [offer.name, offer.description, offer.priceRange].filter(
            (value): value is string => Boolean(value?.trim()),
          ),
        ),
      };
    case "contact":
      return {
        paths: ["site.primaryCta"],
        visibleTexts: [content.primaryCta.label],
      };
    case "hours":
      return {
        paths: ["site.hours"],
        visibleTexts: fact.value.flatMap((hours) =>
          [hours.dayRange, hours.open, hours.close, hours.note].filter(
            (value): value is string => Boolean(value?.trim()),
          ),
        ),
      };
    case "address":
      return {
        paths: ["site.address"],
        visibleTexts: [content.address ?? ""].filter(Boolean),
      };
    case "service_area":
      return {
        paths: ["site.deliveryArea"],
        visibleTexts: fact.value.flatMap((area) =>
          [area.area, area.note].filter((value): value is string =>
            Boolean(value?.trim()),
          ),
        ),
      };
    case "price":
      return {
        paths: ["site.priceRange"],
        visibleTexts: fact.value.flatMap((price) =>
          [price.amount, price.currency, price.note].filter(
            (value): value is string => Boolean(value?.trim()),
          ),
        ),
      };
    case "payment_method":
      return {
        paths: ["site.paymentMethods"],
        visibleTexts: fact.value.flatMap((payment) =>
          [payment.method, payment.detail].filter((value): value is string =>
            Boolean(value?.trim()),
          ),
        ),
      };
    case "certification":
      return {
        paths: ["site.certifications"],
        visibleTexts: fact.value.flatMap((certification) =>
          [certification.name, certification.issuer].filter(
            (value): value is string => Boolean(value?.trim()),
          ),
        ),
      };
    case "testimonial":
      return {
        paths: ["site.testimonials"],
        visibleTexts: fact.value.flatMap((testimonial) =>
          [testimonial.quote, testimonial.author, testimonial.context].filter(
            (value): value is string => Boolean(value?.trim()),
          ),
        ),
      };
    case "social_link":
      return {
        paths: ["site.socialLinks"],
        visibleTexts: fact.value.flatMap((social) =>
          [social.handle, social.url].filter((value): value is string =>
            Boolean(value?.trim()),
          ),
        ),
      };
    case "promotion":
      return {
        paths: ["site.promotion"],
        visibleTexts: fact.value.flatMap((promotion) =>
          [promotion.title, promotion.detail, promotion.validUntil].filter(
            (value): value is string => Boolean(value?.trim()),
          ),
        ),
      };
    case "other":
      return { paths: ["site.otherFacts"], visibleTexts: [fact.value] };
    default:
      return unreachableFact(fact);
  }
}

export function createProfessionalRouteBinding(input: {
  route: GeneratedSiteWriterContractV3["obligations"]["routes"][number];
  sections: GeneratedSiteWriterContractV3["obligations"]["sections"];
  facts: ContractFactV1[];
  content: ProfessionalSiteContentV1;
  primaryJob: string;
  kit?: GeneratedSiteDesignKitV2;
  mediaMode?: GeneratedSiteKitMediaMode;
}): ProfessionalRouteBinding {
  const factById = new Map(input.facts.map((fact) => [fact.id, fact]));
  const sectionById = new Map(
    input.sections.map((section) => [section.id, section]),
  );
  const roles =
    deriveProfessionalRouteRolesFromObligations({
      routes: [
        {
          path: input.route.path,
          purpose: input.route.purpose,
          requiredFactIds: input.route.requiredFactIds,
          requiredSectionIds: input.route.requiredSectionIds,
        },
      ],
      sections: input.sections,
      facts: input.facts,
    })[0]?.roles ?? [];
  const sections: ProfessionalRouteBinding["sections"] = [];
  for (const sectionId of input.route.requiredSectionIds) {
    const source = sectionById.get(sectionId);
    if (!source) {
      throw new Error(`unknown required section: ${sectionId}`);
    }
    const bindings = source.requiredFactIds.map((factId) => {
      const fact = factById.get(factId);
      if (!fact) {
        throw new Error(`unknown required fact: ${factId}`);
      }
      return contentBindingForFact({ fact, content: input.content });
    });
    sections.push({
      id: source.id,
      purpose: source.purpose,
      role: classifyProfessionalContentRole({
        id: source.id,
        purpose: source.purpose,
        requiredFactKinds: source.requiredFactIds.flatMap((factId) => {
          const fact = factById.get(factId);
          return fact ? [fact.kind] : [];
        }),
      }),
      requiredFactIds: [...source.requiredFactIds],
      requiredContentPaths: unique(
        bindings.flatMap((binding) => binding.paths),
      ),
      requiredVisibleTexts: unique(
        bindings.flatMap((binding) => binding.visibleTexts).filter(Boolean),
      ),
    });
  }

  const hasIdentitySection = sections.some(
    (section) => section.role === "identity",
  );
  if (!hasIdentitySection) {
    const structuralFactIds = input.route.requiredFactIds.filter((factId) => {
      const fact = factById.get(factId);
      return fact?.kind === "offer" || fact?.kind === "contact";
    });
    const offerTexts = input.content.offers.flatMap((offer) =>
      [offer.name, offer.description].filter((value): value is string =>
        Boolean(value?.trim()),
      ),
    );
    sections.unshift({
      id: "hero",
      purpose: "Accepted identity, offer, and primary action",
      role: "identity",
      requiredFactIds: structuralFactIds,
      requiredContentPaths: [
        "site.businessName",
        "site.offers",
        "site.primaryCta",
      ],
      requiredVisibleTexts: unique([
        input.content.businessName,
        ...offerTexts,
        input.content.primaryCta.label,
      ]),
    });
  }

  if (!sections.some((section) => section.role === "contact")) {
    const targetFactId = input.content.primaryCta.targetFactId;
    sections.push({
      id: "contact",
      purpose: "Accepted primary action",
      role: "contact",
      requiredFactIds: targetFactId ? [targetFactId] : [],
      requiredContentPaths: ["site.primaryCta"],
      requiredVisibleTexts: [input.content.primaryCta.label],
    });
  }

  const routeFacts = input.route.requiredFactIds.map((factId) => {
    const fact = factById.get(factId);
    if (!fact) {
      throw new Error(`unknown required fact: ${factId}`);
    }
    return contentBindingForFact({ fact, content: input.content });
  });
  const routeRoles = new Set(roles);
  for (const section of sections) {
    routeRoles.add(section.role);
  }
  const routeOfferTexts = input.route.requiredFactIds.flatMap((factId) => {
    const fact = factById.get(factId);
    if (!fact || fact.kind !== "offer") {
      return [];
    }
    return fact.value.flatMap((offer) =>
      [offer.name, offer.description].filter((value): value is string =>
        Boolean(value?.trim()),
      ),
    );
  });
  const offerTexts = unique(
    routeOfferTexts.length ? routeOfferTexts : [input.content.heroTitle],
  );
  const allowedPatternIds =
    input.kit && input.mediaMode
      ? compatibleProfessionalPatterns({
          kit: input.kit,
          contentRoles: [...routeRoles],
          mediaMode: input.mediaMode,
        }).map((pattern) => pattern.id)
      : [];

  return {
    path: input.route.path,
    filePath: routeFilePath(input.route.path),
    exportName: routeExportName(input.route.path),
    purpose: input.route.purpose,
    primaryJob: input.primaryJob,
    requiredFactIds: unique([
      ...input.route.requiredFactIds,
      ...sections.flatMap((section) => section.requiredFactIds),
    ]),
    requiredContentPaths: unique([
      "site.businessName",
      "site.primaryCta",
      ...routeFacts.flatMap((binding) => binding.paths),
      ...sections.flatMap((section) => section.requiredContentPaths),
    ]),
    firstView: {
      identityText: input.content.businessName,
      offerTexts,
      primaryCtaLabel: input.content.primaryCta.label,
      primaryCtaHref: input.content.primaryCta.href,
    },
    allowedPatternIds,
    sections,
  };
}

export function compileProfessionalSiteBlueprint(input: {
  contract: GeneratedSiteWriterContractV3;
  kit: GeneratedSiteDesignKitV2;
}): ProfessionalSiteBlueprintV1 {
  const routes = validateAndNormalizeRoutes(input.contract.obligations.routes);
  if (routes.length > 3) {
    throw new Error("professional site supports at most three routes");
  }
  if (!routes.some((route) => route.path === "/")) {
    throw new Error("professional site requires root route /");
  }
  const sections = input.contract.obligations.sections;
  const routeRoles = deriveProfessionalRouteRolesFromObligations({
    routes,
    sections,
    facts: factsFromContract(input.contract),
  });
  const bindings = routes.map((route, index) => {
    const roles = routeRoles[index]?.roles ?? [];
    const patterns = compatibleProfessionalPatterns({
      kit: input.kit,
      contentRoles: roles,
      mediaMode: input.contract.media.mode,
    });
    if (patterns.length === 0) {
      throw new Error(
        `no compatible professional pattern for route ${route.path}`,
      );
    }
    return createProfessionalRouteBinding({
      route,
      sections,
      facts: factsFromContract(input.contract),
      content: input.contract.content,
      primaryJob: input.contract.business.primaryJob,
      kit: input.kit,
      mediaMode: input.contract.media.mode,
    });
  });
  const subjectAnchors = signatureAnchors(input.contract);
  const allowedAnchors = input.kit.allowedSignatureAnchors.filter((anchor) =>
    subjectAnchors.includes(anchor),
  );
  if (allowedAnchors.length === 0) {
    throw new Error("professional site has no accepted signature anchor");
  }
  const signatureRoute = bindings.some((binding) => binding.path === "/")
    ? "/"
    : (bindings[0]?.path ?? "/");
  const allPatternIds = unique(
    bindings.flatMap((binding) => binding.allowedPatternIds),
  );
  const requireExplicitTransformFor = unique(
    input.kit.compositionPatterns
      .filter(
        (pattern) =>
          allPatternIds.includes(pattern.id) &&
          ["split", "asymmetric", "rail"].includes(pattern.desktopRelationship),
      )
      .map((pattern) => pattern.id),
  );
  const draft = {
    schemaVersion: 1 as const,
    blueprintHash: "",
    contractHash: input.contract.contractHash,
    kit: {
      id: input.kit.id,
      version: 2 as const,
      allowedPatternIds: allPatternIds,
    },
    pageStrategy: {
      mode: routes.length === 1 ? ("single" as const) : ("multi" as const),
      reason:
        routes.length === 1
          ? ("single-primary-job" as const)
          : ("distinct-customer-jobs" as const),
      routeCount: routes.length,
    },
    contentDepth: {
      density: input.contract.visualInputs.density,
      suppliedFactCount: suppliedFactCount(
        input.contract.content,
        input.contract.factIndex,
      ),
      omissionPolicy: "omit-unsupported-sections" as const,
    },
    firstView: {
      requiredRoles: ["identity", "offer", "primary-action"] as const,
    },
    signatureRoute,
    artDirection: {
      subject: input.contract.content.heroTitle,
      audience: input.contract.content.audience,
      acceptedDirection: input.contract.visualInputs.direction,
      variance: input.kit.taste.variance,
      motion: input.kit.taste.motion,
      density: input.kit.taste.density,
      shape: input.kit.taste.shape,
      typography: {
        allowedDisplayStackIds: [
          ...input.kit.typography.allowedDisplayStackIds,
        ],
        bodyStackId: input.kit.typography.bodyStackId,
        maxDisplayRem: input.kit.typography.maxDisplayRem,
        maxBodyCh: input.kit.typography.maxBodyCh,
      },
      palette: {
        backgroundLightness: input.kit.themePolicy.backgroundLightness,
        temperature: input.kit.themePolicy.temperature,
        accentSurfaceMaximum: input.kit.themePolicy.accentSurfaceMaximum,
      },
      rhythm: { ...input.kit.rhythm },
      signature: {
        budget: 1 as const,
        mustReference: allowedAnchors,
        forbidden: [
          "generic decorative signature",
          "reference identity leakage",
          "unsupported customer claim",
        ],
      },
    },
    media: input.contract.media,
    routes: bindings,
    responsive: {
      mobileViewport: { width: 390 as const, height: 844 as const },
      desktopViewport: { width: 1440 as const, height: 1000 as const },
      requireExplicitTransformFor,
      primaryActionVisibleOnMobile: true as const,
    },
  } satisfies Omit<ProfessionalSiteBlueprintV1, "blueprintHash"> & {
    blueprintHash: string;
  };
  return {
    ...draft,
    blueprintHash: createHash("sha256")
      .update(
        "umkmcepat:professional-site-blueprint:v1:" + canonicalJson(draft),
        "utf8",
      )
      .digest("hex"),
  };
}

function factsFromContract(
  contract: GeneratedSiteWriterContractV3,
): ContractFactV1[] {
  const ids = contract.factIndex.map((fact) => fact.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("professional site fact index contains duplicate ids");
  }
  return contract.factIndex.map((fact) =>
    projectedFactFromContent(contract.content, fact.id, fact.kind),
  );
}

function projectedFactFromContent(
  content: ProfessionalSiteContentV1,
  id: string,
  kind: FactKind,
): ContractFactV1 {
  const provenance = {
    source: "owner" as const,
    turnId: null,
    assetId: null,
    supersedesFactId: null,
    reviewItemId: null,
  };
  switch (kind) {
    case "offer":
      return { id, kind, value: content.offers, provenance };
    case "contact":
      return {
        id,
        kind,
        value: { channel: "other", value: content.primaryCta.href },
        provenance,
      };
    case "hours":
      return { id, kind, value: content.hours, provenance };
    case "address":
      return { id, kind, value: { line1: content.address ?? "" }, provenance };
    case "service_area":
      return {
        id,
        kind,
        value: content.deliveryArea ? [{ area: content.deliveryArea }] : [],
        provenance,
      };
    case "price":
      return {
        id,
        kind,
        value: content.priceRange ? [{ amount: content.priceRange }] : [],
        provenance,
      };
    case "payment_method":
      return { id, kind, value: content.paymentMethods, provenance };
    case "certification":
      return { id, kind, value: content.certifications, provenance };
    case "testimonial":
      return { id, kind, value: content.testimonials, provenance };
    case "social_link":
      return { id, kind, value: content.socialLinks, provenance };
    case "promotion":
      return {
        id,
        kind,
        value: content.promotion ? [{ title: content.promotion }] : [],
        provenance,
      };
    case "other":
      return { id, kind, value: content.otherFacts[0] ?? "", provenance };
    default:
      return unreachableFact(kind);
  }
}

function signatureAnchors(
  contract: GeneratedSiteWriterContractV3,
): Array<"offer" | "product" | "process" | "place" | "craft" | "audience"> {
  const anchors: Array<
    "offer" | "product" | "process" | "place" | "craft" | "audience"
  > = [];
  if (contract.content.offers.length > 0) {
    anchors.push("offer", "product");
  }
  if (contract.content.audience) {
    anchors.push("audience");
  }
  if (contract.content.address || contract.content.deliveryArea) {
    anchors.push("place");
  }
  if (contract.content.otherFacts.length > 0) {
    anchors.push("craft");
  }
  return unique(anchors);
}

function suppliedFactCount(
  content: ProfessionalSiteContentV1,
  factIndex: Array<{ id: string; kind: FactKind }>,
): number {
  const contentValues: unknown[] = [
    content.audience,
    content.ownerTagline,
    content.offers,
    content.usp,
    content.testimonials,
    content.certifications,
    content.hours,
    content.paymentMethods,
    content.priceRange,
    content.address,
    content.deliveryArea,
    content.socialLinks,
    content.promotion,
    content.secondaryCta,
    content.otherFacts,
  ];
  return (
    factIndex.length +
    contentValues.filter((value) =>
      Array.isArray(value) ? value.length > 0 : Boolean(value),
    ).length
  );
}

function validateAndNormalizeRoutes(
  routes: GeneratedSiteWriterContractV3["obligations"]["routes"],
): Array<ProfessionalRouteRoleInput> {
  const seen = new Set<string>();
  return routes.map((route) => {
    if (route.path.includes(":")) {
      throw new Error("dynamic routes are unsupported");
    }
    if (route.path.includes("*")) {
      throw new Error("wildcard routes are unsupported");
    }
    const path = normalizeStaticRoute(route.path);
    if (seen.has(path)) {
      throw new Error(`duplicate route: ${path}`);
    }
    seen.add(path);
    return {
      path,
      purpose: route.purpose,
      requiredFactIds: [...route.requiredFactIds],
      requiredSectionIds: [...route.requiredSectionIds],
    };
  });
}

function normalizeStaticRoute(path: string): string {
  if (path === "/") {
    return path;
  }
  if (!/^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(path)) {
    throw new Error(`unsafe route path: ${path}`);
  }
  return path;
}

function routeFilePath(path: string): string {
  return path === "/"
    ? "src/routes/index.tsx"
    : `src/routes/${path.slice(1)}.tsx`;
}

function routeExportName(path: string): string {
  if (path === "/") {
    return "HomeRouteComponent";
  }
  const words = path
    .slice(1)
    .split("/")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`);
  return `${words.join("")}RouteComponent`;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function unreachableFact(value: never): never {
  throw new Error(`unsupported accepted fact kind: ${String(value)}`);
}

export { classifyProfessionalContentRole, deriveProfessionalRouteRoles };

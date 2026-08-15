import ts from "typescript";

import {
  inspectGeneratedSiteTasteSource,
  inspectSiteFieldReferences,
  type GeneratedSiteGateFinding,
} from "./generated-site-gates";

import type {
  GeneratedSiteWriterContractV3,
  ProfessionalContentPath,
} from "./generated-site-contract";
import type { GeneratedProjectFile } from "./generated-types";
import type { ProfessionalSiteBlueprintV1 } from "./professional-site-blueprint";
import type { GeneratedSiteDesignKitV2 } from "./professional-site-kits";
import type { WriterDesignPlanV3 } from "./professional-site-plan";
import type { ThemeContrastCheck } from "./scaffold/shadcn-theme";

export type ProfessionalSiteHardFailureKind =
  "fact" | "action" | "media" | "accessibility" | "route" | "contract";

export type ProfessionalSiteSignalCode =
  | "equal-treatment-run"
  | "uniform-section-spacing"
  | "card-repetition"
  | "first-view-empty-area"
  | "accent-surface-share"
  | "long-prose"
  | "weak-heading-scale"
  | "empty-signature-node";

export type ProfessionalSiteSourceGateReportV1 = {
  version: 1;
  status: "pass" | "fail";
  findings: GeneratedSiteGateFinding[];
  hardFailureCounts: Record<ProfessionalSiteHardFailureKind, number>;
  professionalSignals: Array<{
    code: ProfessionalSiteSignalCode;
    path: string;
    detail: string;
  }>;
};

const hardKindByCategory = {
  claims: "fact",
  content: "fact",
  cta: "action",
  media: "media",
  accessibility: "accessibility",
  contract: "contract",
  starter: "contract",
  language: "contract",
  genericness: "contract",
} as const satisfies Record<
  GeneratedSiteGateFinding["category"],
  ProfessionalSiteHardFailureKind
>;

const PROTECTED_PATHS = new Set([
  "package.json",
  "vite.config.ts",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
  "eslint.config.js",
  "index.html",
  "src/main.tsx",
  "src/router.tsx",
  "src/index.css",
  "src/content/site.ts",
  "src/routes/__root.tsx",
  "src/routes/not-found.tsx",
  "src/lib/preview-ready.ts",
  "src/lib/utils.ts",
  "src/components/site/layout.tsx",
]);

const COMPILED_PROTECTED_PATHS = new Set([
  "src/router.tsx",
  "src/index.css",
  "src/content/site.ts",
]);

const GENERATED_ROUTE_PREFIX = "src/routes/";
const HEX_LITERAL = /#[0-9a-f]{3,8}\b/i;
const REMOTE_URL = /(?:https?:)?\/\//i;
const PLACEHOLDER =
  /(?:\/placeholder(?:-vertical)?\.svg|replace this with|ganti foto)/i;
const FALLBACK_COPY =
  /Pilihan yang mudah dilihat|Katalog jadi hero utama|Fitur disederhanakan|Info jelas|Online murni/i;
const NAMED_PALETTE_UTILITY =
  /\b(?:bg|text|border)-(?:white|black|gray|slate|zinc|stone|neutral|red|blue|green|amber|yellow|orange|purple|pink|violet|indigo|cyan|teal|emerald|lime|rose|fuchsia|sky)(?:-[\w/.[\]-]+)?\b/i;
const DATA_ATTRIBUTE = (name: string): RegExp =>
  new RegExp(`\\b${name}(?:\\s*=\\s*(?:["'][^"']*["']|\\{[^}]*\\}))?`, "gi");

export function inspectProfessionalStaticSiteSource(input: {
  contract: GeneratedSiteWriterContractV3;
  blueprint: ProfessionalSiteBlueprintV1;
  kit: GeneratedSiteDesignKitV2;
  plan: WriterDesignPlanV3;
  files: GeneratedProjectFile[];
  starterFiles: GeneratedProjectFile[];
  themeChecks: ThemeContrastCheck[];
}): ProfessionalSiteSourceGateReportV1 {
  const findings: GeneratedSiteGateFinding[] = [];
  const professionalSignals: ProfessionalSiteSourceGateReportV1["professionalSignals"] =
    [];
  const hardFailureCounts: Record<ProfessionalSiteHardFailureKind, number> = {
    fact: 0,
    action: 0,
    media: 0,
    accessibility: 0,
    route: 0,
    contract: 0,
  };
  const addHard = (
    category: GeneratedSiteGateFinding["category"],
    severity: GeneratedSiteGateFinding["severity"],
    code: string,
    message: string,
    path?: string,
    routeFailure = false,
  ): void => {
    findings.push({
      category,
      severity,
      code,
      message,
      ...(path ? { path } : {}),
    });
    hardFailureCounts[hardKindByCategory[category]] += 1;
    if (routeFailure) {
      hardFailureCounts.route += 1;
    }
  };
  const addSignal = (
    code: ProfessionalSiteSignalCode,
    path: string,
    detail: string,
  ): void => {
    if (professionalSignals.length < 20) {
      professionalSignals.push({ code, path, detail });
    }
  };

  checkDuplicatePaths(input.files, addHard);
  checkProtectedFiles(input.files, input.starterFiles, addHard);
  inspectCompiledProtectedFiles(input.files, input.blueprint, addHard);
  inspectEditablePaths(input, addHard);
  const routeFiles = input.files.filter((file) =>
    isGeneratedRoutePath(file.path),
  );
  const expectedRoutes = new Map(
    input.blueprint.routes.map((route) => [route.filePath, route]),
  );
  for (const [path, route] of expectedRoutes) {
    const file = input.files.find((candidate) => candidate.path === path);
    if (!file) {
      addHard(
        "contract",
        "critical",
        "missing-route-file",
        `Required route file ${path} is missing.`,
        path,
        true,
      );
      continue;
    }
    inspectRoute(file, route, input, addHard, addSignal);
  }
  for (const file of routeFiles) {
    if (!expectedRoutes.has(file.path)) {
      addHard(
        "contract",
        "critical",
        "unexpected-route-file",
        `Route file ${file.path} is not in the immutable blueprint.`,
        file.path,
        true,
      );
    }
  }
  inspectSignatureHooks(input, routeFiles, addHard);

  const shellFiles = input.files.filter(
    (file) => file.path === "src/components/site/generated-shell.tsx",
  );
  if (
    input.blueprint.pageStrategy.mode === "multi" &&
    shellFiles.length !== 1
  ) {
    addHard(
      "contract",
      "critical",
      "missing-shared-shell",
      "Multi-route output must include exactly one generated shared shell.",
      "src/components/site/generated-shell.tsx",
      true,
    );
  }
  for (const shell of shellFiles) {
    if (hasAnyHook(shell.content)) {
      addHard(
        "contract",
        "critical",
        "shell-hook-forbidden",
        "Shared shell cannot own route first-view, primary-action, or signature hooks.",
        shell.path,
      );
    }
  }

  inspectPlan(input, addHard);
  inspectSiteContent(input, routeFiles, shellFiles, addHard);
  inspectCustomerSource(routeFiles, shellFiles, addHard);
  inspectCtaAndLinks(input, routeFiles, addHard);
  inspectThemeAndTypography(input, routeFiles, shellFiles, addHard);
  inspectMedia(input, routeFiles, shellFiles, addHard);
  inspectCompileSafety(routeFiles, shellFiles, addHard);
  inspectStarterAndTaste(input, routeFiles, addHard);
  inspectAssertions(input, routeFiles, addHard);
  inspectThemeChecks(input.themeChecks, addHard);
  inspectProfessionalSignals(input, routeFiles, addSignal);

  return {
    version: 1,
    status: findings.length > 0 ? "fail" : "pass",
    findings,
    hardFailureCounts,
    professionalSignals,
  };
}

function inspectRoute(
  file: GeneratedProjectFile,
  route: ProfessionalSiteBlueprintV1["routes"][number],
  input: {
    blueprint: ProfessionalSiteBlueprintV1;
    plan: WriterDesignPlanV3;
  },
  addHard: AddHard,
  addSignal: AddSignal,
): void {
  const source = file.content;
  if (
    !new RegExp(
      `export\\s+(?:async\\s+)?function\\s+${escapeRegExp(route.exportName)}\\b`,
    ).test(source)
  ) {
    addHard(
      "contract",
      "critical",
      "route-export-missing",
      `Route ${route.path} must export ${route.exportName}.`,
      file.path,
      true,
    );
  }
  const firstViewCount = countAttribute(source, "data-first-view");
  if (firstViewCount !== 1) {
    addHard(
      "contract",
      "critical",
      "first-view-hook-count",
      `Route ${route.path} must have exactly one data-first-view hook; found ${firstViewCount}.`,
      file.path,
      true,
    );
  } else if (invalidHook(source, "data-first-view")) {
    addHard(
      "contract",
      "critical",
      "first-view-hook-invalid",
      `Route ${route.path} first view is hidden or empty.`,
      file.path,
      true,
    );
  }
  const primaryCount = countAttribute(source, "data-primary-action");
  if (primaryCount !== 1) {
    addHard(
      "cta",
      "critical",
      "primary-action-hook-count",
      `Route ${route.path} must have exactly one data-primary-action hook; found ${primaryCount}.`,
      file.path,
      true,
    );
  } else {
    inspectPrimaryAction(source, route, addHard);
  }
  const pattern = input.plan.routes.find(
    (candidate) => candidate.path === route.path,
  )?.patternId;
  if (!pattern || countExactAttribute(source, "data-pattern", pattern) !== 1) {
    addHard(
      "contract",
      "high",
      "pattern-hook-missing",
      `Route ${route.path} must expose its selected data-pattern exactly once.`,
      file.path,
      true,
    );
  }
  if (!/usePreviewReady\s*\(\s*\)/.test(source)) {
    addHard(
      "contract",
      "high",
      "preview-ready-hook-missing",
      `Route ${route.path} must call usePreviewReady().`,
      file.path,
      true,
    );
  }
  for (const section of route.sections) {
    const sectionCount = countExactAttribute(
      source,
      "data-section-id",
      section.id,
    );
    if (sectionCount !== 1) {
      addHard(
        "contract",
        "critical",
        "section-hook-missing",
        `Route ${route.path} must expose data-section-id=${section.id} exactly once.`,
        file.path,
        true,
      );
    }
    for (const contentPath of section.requiredContentPaths) {
      if (!hasSitePath(source, contentPath)) {
        addHard(
          "content",
          "high",
          "section-content-missing",
          `${contentPath} is not rendered in bound section ${section.id}.`,
          file.path,
          true,
        );
      }
    }
  }
  for (const contentPath of route.requiredContentPaths) {
    if (!hasSitePath(source, contentPath)) {
      addHard(
        "content",
        "critical",
        "route-content-missing",
        `${contentPath} is not rendered on bound route ${route.path}.`,
        file.path,
        true,
      );
    }
  }
  if (hasLargeBlankFirstView(source)) {
    addSignal(
      "first-view-empty-area",
      file.path,
      "first view contains a large empty-area utility around sparse content",
    );
  }
}

type AddHard = (
  category: GeneratedSiteGateFinding["category"],
  severity: GeneratedSiteGateFinding["severity"],
  code: string,
  message: string,
  path?: string,
  routeFailure?: boolean,
) => void;
type AddSignal = (
  code: ProfessionalSiteSignalCode,
  path: string,
  detail: string,
) => void;

function inspectSignatureHooks(
  input: {
    blueprint: ProfessionalSiteBlueprintV1;
    plan: WriterDesignPlanV3;
  },
  routeFiles: GeneratedProjectFile[],
  addHard: AddHard,
): void {
  const signatureFiles = routeFiles.filter(
    (file) => countAttribute(file.content, "data-signature") > 0,
  );
  const signatureCount = signatureFiles.reduce(
    (total, file) => total + countAttribute(file.content, "data-signature"),
    0,
  );
  if (signatureCount !== 1) {
    addHard(
      "contract",
      "critical",
      "signature-hook-count",
      `The professional site must have exactly one data-signature hook; found ${signatureCount}.`,
      undefined,
      true,
    );
    return;
  }
  const signatureRoute = input.plan.signature.route;
  const signatureFile = signatureFiles[0];
  const expectedFile = input.blueprint.routes.find(
    (route) => route.path === signatureRoute,
  )?.filePath;
  if (!signatureFile || signatureFile.path !== expectedFile) {
    addHard(
      "contract",
      "critical",
      "signature-route-mismatch",
      `The data-signature hook must live on ${signatureRoute}.`,
      signatureFile?.path,
      true,
    );
    return;
  }
  if (invalidHook(signatureFile.content, "data-signature")) {
    addHard(
      "contract",
      "critical",
      "signature-hook-invalid",
      "The data-signature hook is hidden or empty.",
      signatureFile.path,
      true,
    );
  }
  const anchorPath = signatureAnchorPath(input.plan.signature.sourceAnchor);
  if (!hasSitePath(signatureFile.content, anchorPath)) {
    addHard(
      "content",
      "high",
      "signature-anchor-missing",
      `The signature does not render its accepted ${input.plan.signature.sourceAnchor} anchor.`,
      signatureFile.path,
      true,
    );
  }
}

function signatureAnchorPath(
  anchor: WriterDesignPlanV3["signature"]["sourceAnchor"],
): string {
  switch (anchor) {
    case "offer":
    case "product":
      return "site.offers";
    case "audience":
      return "site.audience";
    case "place":
      return "site.address";
    case "craft":
      return "site.otherFacts";
    case "process":
      return "site.labels.process";
  }
}

function inspectPrimaryAction(
  source: string,
  route: ProfessionalSiteBlueprintV1["routes"][number],
  addHard: AddHard,
): void {
  const match = source.match(
    /<(a|button)\b([^>]*\bdata-primary-action\b[^>]*)>/i,
  );
  if (!match) {
    addHard(
      "cta",
      "critical",
      "primary-action-not-actionable",
      `Route ${route.path} primary action is not a real anchor or button.`,
      undefined,
      true,
    );
    return;
  }
  const attributes = match[2] ?? "";
  if (
    match[1]?.toLowerCase() === "a" &&
    !/href\s*=\s*\{\s*site\.primaryCta\.href\s*\}/.test(attributes)
  ) {
    addHard(
      "cta",
      "critical",
      "primary-cta-target",
      `Route ${route.path} primary action does not use site.primaryCta.href.`,
      undefined,
      true,
    );
  }
  if (!/site\.primaryCta\.label/.test(source)) {
    addHard(
      "cta",
      "high",
      "primary-cta-label",
      `Route ${route.path} primary action does not render site.primaryCta.label.`,
      undefined,
      true,
    );
  }
  if (
    route.firstView.primaryCtaHref.startsWith("http") &&
    match[1]?.toLowerCase() === "a"
  ) {
    if (
      !/target\s*=\s*["']_blank["']/.test(attributes) ||
      !/rel\s*=\s*["'][^"']*noopener[^"']*noreferrer[^"']*["']/.test(attributes)
    ) {
      addHard(
        "cta",
        "critical",
        "external-rel",
        `Route ${route.path} external primary action must use target=_blank and rel=noopener noreferrer.`,
        undefined,
        true,
      );
    }
  }
  if (invalidHook(source, "data-primary-action")) {
    addHard(
      "cta",
      "critical",
      "primary-action-hook-invalid",
      `Route ${route.path} primary action is hidden or empty.`,
      undefined,
      true,
    );
  }
}

function inspectSiteContent(
  input: {
    contract: GeneratedSiteWriterContractV3;
    blueprint: ProfessionalSiteBlueprintV1;
    files: GeneratedProjectFile[];
  },
  routeFiles: GeneratedProjectFile[],
  shellFiles: GeneratedProjectFile[],
  addHard: AddHard,
): void {
  const contentFile = input.files.find(
    (file) => file.path === "src/content/site.ts",
  );
  const site = contentFile ? parseSiteValue(contentFile.content) : null;
  if (!site) {
    addHard(
      "contract",
      "critical",
      "site-content-unreadable",
      "Protected src/content/site.ts is not a readable JSON-backed site value.",
      "src/content/site.ts",
    );
    return;
  }
  for (const [key, value] of Object.entries(input.contract.content)) {
    if (
      !Object.prototype.hasOwnProperty.call(site, key) ||
      !sameJson(site[key], value)
    ) {
      addHard(
        "content",
        "critical",
        "site-content-mismatch",
        `site.${key} does not equal the accepted contract content.`,
        "src/content/site.ts",
      );
    }
  }
  const routeSource = [...routeFiles, ...shellFiles]
    .map((file) => file.content)
    .join("\n");
  const populatedPaths = populatedContentPaths(input.contract.content);
  for (const path of populatedPaths) {
    if (!hasSitePath(routeSource, path)) {
      addHard(
        "content",
        "critical",
        "populated-content-missing",
        `${path} is populated but is not rendered by any generated route.`,
      );
    }
    const boundRoutes = input.blueprint.routes.filter((route) =>
      route.requiredContentPaths.includes(path as ProfessionalContentPath),
    );
    if (boundRoutes.length > 0) {
      for (const file of routeFiles) {
        const route = input.blueprint.routes.find(
          (candidate) => candidate.filePath === file.path,
        );
        if (
          route &&
          hasSitePath(file.content, path) &&
          !boundRoutes.some((bound) => bound.path === route.path)
        ) {
          addHard(
            "content",
            "high",
            "content-outside-route-binding",
            `${path} is rendered outside its accepted route binding.`,
            file.path,
            true,
          );
        }
      }
    }
  }
  for (const file of routeFiles) {
    for (const reference of inspectSiteFieldReferences({
      content: file.content,
      site,
    })) {
      addHard(
        "content",
        "critical",
        "unknown-site-field",
        `Generated source references ${reference}, absent from site.ts.`,
        file.path,
        true,
      );
    }
  }
  const prohibitedClaims = [
    ...input.contract.obligations.prohibitedClaims,
    ...input.blueprint.artDirection.signature.forbidden,
  ];
  for (const claim of prohibitedClaims) {
    if (
      claim.trim() &&
      routeSource.toLocaleLowerCase().includes(claim.toLocaleLowerCase())
    ) {
      addHard(
        "claims",
        "critical",
        "prohibited-claim",
        "Generated route contains a prohibited accepted-claim phrase.",
      );
    }
  }
}

function inspectCtaAndLinks(
  input: {
    contract: GeneratedSiteWriterContractV3;
    blueprint: ProfessionalSiteBlueprintV1;
  },
  routeFiles: GeneratedProjectFile[],
  addHard: AddHard,
): void {
  const allowedRoutes = new Set(
    input.blueprint.routes.map((route) => route.path),
  );
  for (const file of routeFiles) {
    const source = file.content;
    const knownIds = new Set([
      ...[...source.matchAll(/\bid=["']([^"']+)["']/gi)].map(
        (match) => match[1] ?? "",
      ),
      ...[...source.matchAll(/data-section-id=["']([^"']+)["']/gi)].map(
        (match) => match[1] ?? "",
      ),
    ]);
    for (const match of source.matchAll(/href\s*=\s*["']#([^"']*)["']/gi)) {
      const target = match[1] ?? "";
      const isRoute = target.startsWith("/") && allowedRoutes.has(target);
      if (target && !isRoute && !knownIds.has(target)) {
        addHard(
          "cta",
          "critical",
          "unregistered-anchor",
          `Generated link #${target} has no registered route or anchor.`,
          file.path,
          true,
        );
      }
      if (!target) {
        addHard(
          "cta",
          "critical",
          "unregistered-anchor",
          "Generated link uses an empty hash target.",
          file.path,
          true,
        );
      }
    }
    for (const match of source.matchAll(/<a\b([^>]*)>/gi)) {
      const attributes = match[1] ?? "";
      const href = attributes.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
      if (
        href &&
        REMOTE_URL.test(href) &&
        !/rel\s*=\s*["'][^"']*noopener[^"']*noreferrer[^"']*["']/i.test(
          attributes,
        )
      ) {
        addHard(
          "cta",
          "critical",
          "external-rel",
          "External generated links must include noopener noreferrer.",
          file.path,
        );
      }
    }
  }
}

function inspectPlan(
  input: {
    blueprint: ProfessionalSiteBlueprintV1;
    kit: GeneratedSiteDesignKitV2;
    plan: WriterDesignPlanV3;
  },
  addHard: AddHard,
): void {
  if (input.plan.blueprintHash !== input.blueprint.blueprintHash) {
    addHard(
      "contract",
      "critical",
      "plan-blueprint-mismatch",
      "V3 plan blueprintHash differs from the immutable blueprint.",
    );
  }
  if (
    input.plan.signature.route !== input.blueprint.signatureRoute ||
    !input.blueprint.routes.some(
      (route) => route.path === input.plan.signature.route,
    )
  ) {
    addHard(
      "contract",
      "critical",
      "plan-signature-route",
      "V3 plan signature route differs from the blueprint.",
    );
  }
  if (
    !input.kit.typography.allowedDisplayStackIds.includes(
      input.plan.typography.displayStackId,
    ) ||
    input.plan.typography.bodyStackId !== input.kit.typography.bodyStackId
  ) {
    addHard(
      "contract",
      "critical",
      "plan-typography-mismatch",
      "V3 plan typography is outside the selected kit.",
    );
  }
  const planRoutes = new Map(
    input.plan.routes.map((route) => [route.path, route]),
  );
  for (const route of input.blueprint.routes) {
    const planned = planRoutes.get(route.path);
    if (!planned || !route.allowedPatternIds.includes(planned.patternId)) {
      addHard(
        "contract",
        "critical",
        "plan-route-mismatch",
        `V3 plan has no compatible pattern for ${route.path}.`,
        undefined,
        true,
      );
      continue;
    }
    for (const section of route.sections) {
      const plannedSection = planned.sections.find(
        (candidate) => candidate.id === section.id,
      );
      if (
        !plannedSection ||
        !input.kit.allowedSectionTreatments.includes(plannedSection.treatment)
      ) {
        addHard(
          "contract",
          "critical",
          "plan-section-mismatch",
          `V3 plan omits or mis-treats section ${section.id}.`,
          undefined,
          true,
        );
      }
    }
  }
  if (planRoutes.size !== input.blueprint.routes.length) {
    addHard(
      "contract",
      "critical",
      "plan-route-count",
      "V3 plan route count differs from the blueprint.",
      undefined,
      true,
    );
  }
}

function inspectThemeAndTypography(
  input: { plan: WriterDesignPlanV3 },
  routeFiles: GeneratedProjectFile[],
  shellFiles: GeneratedProjectFile[],
  addHard: AddHard,
): void {
  const source = [...routeFiles, ...shellFiles]
    .map((file) => file.content)
    .join("\n");
  if (
    HEX_LITERAL.test(source) ||
    NAMED_PALETTE_UTILITY.test(source) ||
    /style\s*=\s*\{\{[^}]*\b(?:color|background|border)/i.test(source) ||
    /site\.theme\b/.test(source)
  ) {
    addHard(
      "accessibility",
      "critical",
      "raw-palette",
      "Generated source bypasses the compiled semantic theme tokens.",
    );
  }
  if (
    /font-\[[^\]]+\]|font-family|fonts\.googleapis|@import\s+url/i.test(source)
  ) {
    addHard(
      "accessibility",
      "critical",
      "font-policy",
      "Generated source declares an arbitrary or remote font.",
    );
  }
  if (!source.includes("font-display")) {
    addHard(
      "accessibility",
      "high",
      "font-role-missing",
      `Generated source omits font-display for ${input.plan.typography.displayStackId}.`,
    );
  }
  if (!source.includes("font-body")) {
    addHard(
      "accessibility",
      "high",
      "font-role-missing",
      `Generated source omits font-body for ${input.plan.typography.bodyStackId}.`,
    );
  }
  if (
    /bg-clip-text|text-transparent\b/.test(source) &&
    /bg-gradient|gradient-to/.test(source)
  ) {
    addHard(
      "genericness",
      "high",
      "gradient-text",
      "Generated source uses gradient text instead of the selected type system.",
    );
  }
}

function inspectMedia(
  input: { contract: GeneratedSiteWriterContractV3 },
  routeFiles: GeneratedProjectFile[],
  shellFiles: GeneratedProjectFile[],
  addHard: AddHard,
): void {
  const source = [...routeFiles, ...shellFiles]
    .map((file) => file.content)
    .join("\n");
  if (PLACEHOLDER.test(source)) {
    addHard(
      "media",
      "critical",
      "media-invalid",
      "Generated source contains a placeholder or fallback media asset.",
    );
  }
  for (const match of source.matchAll(
    /<(?:img|video|iframe|audio)\b([^>]*)>/gi,
  )) {
    const attributes = match[1] ?? "";
    const src =
      attributes.match(/(?:src|poster)\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
    if (
      !src ||
      REMOTE_URL.test(src) ||
      !approvedMediaSource(src, input.contract)
    ) {
      addHard(
        "media",
        "critical",
        "media-invalid",
        "Generated media is empty, remote, or outside the accepted media mode.",
      );
    }
  }
  if (/\b(?:backgroundImage|src)\s*[:=].*(?:https?:|url\s*\()/i.test(source)) {
    addHard(
      "media",
      "critical",
      "media-invalid",
      "Generated source references remote media.",
    );
  }
  if (
    input.contract.media.mode !== "owner_assets" &&
    /\/media\//i.test(source)
  ) {
    addHard(
      "media",
      "critical",
      "media-unapproved",
      "Generated source references owner media while the accepted mode forbids it.",
    );
  }
  if (
    /<(?:span|div)\b(?=[^>]*aria-hidden=["']true["'])(?=[^>]*className=["'][^"']*(?:aspect-|\bh-\d|\bw-\d)[^"']*(?:bg-|\bborder-)[^"']*["'])[^>]*\/?>(?:\s*<\/\w+>)?/i.test(
      source,
    )
  ) {
    addHard(
      "media",
      "high",
      "empty-media-frame",
      "Generated source contains an empty framed shape that reads as missing media.",
    );
  }
}

function inspectCompileSafety(
  routeFiles: GeneratedProjectFile[],
  shellFiles: GeneratedProjectFile[],
  addHard: AddHard,
): void {
  for (const file of [...routeFiles, ...shellFiles]) {
    const result = ts.transpileModule(file.content, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2023,
      },
      fileName: file.path,
      reportDiagnostics: true,
    });
    if (result.diagnostics?.length) {
      addHard(
        "contract",
        "critical",
        "compile-unsafe",
        `Generated source has ${result.diagnostics.length} TypeScript/TSX syntax diagnostic(s).`,
        file.path,
      );
    }
  }
}

function inspectStarterAndTaste(
  input: {
    blueprint: ProfessionalSiteBlueprintV1;
    files: GeneratedProjectFile[];
    starterFiles: GeneratedProjectFile[];
  },
  routeFiles: GeneratedProjectFile[],
  addHard: AddHard,
): void {
  const source = routeFiles.map((file) => file.content).join("\n");
  const starterByPath = new Map(
    input.starterFiles.map((file) => [file.path, file.content]),
  );
  if (
    STARTER_MARKER.test(source) ||
    FALLBACK_COPY.test(source) ||
    routeFiles.some(
      (file) =>
        starterByPath.has(file.path) &&
        starterByPath.get(file.path) === file.content,
    )
  ) {
    addHard(
      "starter",
      "critical",
      "starter-residue",
      "Generated source retains starter or fixed-renderer copy.",
    );
  }
  const tasteFindings = inspectGeneratedSiteTasteSource({
    source,
    sectionCount: Math.max(
      1,
      input.blueprint.routes.reduce(
        (total, route) => total + route.sections.length,
        0,
      ),
    ),
  });
  for (const finding of tasteFindings) {
    addHard(finding.category, finding.severity, finding.code, finding.message);
  }
  if (
    source.includes("dangerouslySetInnerHTML") ||
    /\bcontent-\[[^\]]+\]|\bcontent\s*:\s*["']/i.test(source)
  ) {
    addHard(
      "contract",
      "critical",
      "generated-content-bypass",
      "Generated source uses CSS/Tailwind generated content or dangerouslySetInnerHTML.",
    );
  }
  if (hasNestedCard(source)) {
    addHard(
      "genericness",
      "high",
      "nested-card",
      "Generated source nests a card-like rounded surface inside another card-like surface.",
    );
  }
  const generatedFiles = routeFiles.filter(
    (file) =>
      file.path.startsWith("src/routes/") ||
      file.path === "src/components/site/generated-shell.tsx",
  );
  const bytes = generatedFiles.reduce(
    (total, file) => total + Buffer.byteLength(file.content, "utf8"),
    0,
  );
  const limit =
    input.blueprint.pageStrategy.mode === "multi" ? 48 * 1024 : 32 * 1024;
  if (bytes > limit) {
    addHard(
      "contract",
      "critical",
      "byte-budget",
      `Generated editable source is ${bytes} UTF-8 bytes; limit is ${limit}.`,
    );
  }
  if (
    generatedFiles.length >
    input.blueprint.routes.length +
      (input.blueprint.pageStrategy.mode === "multi" ? 1 : 0)
  ) {
    addHard(
      "contract",
      "critical",
      "file-count",
      "Generated editable file count exceeds the immutable route budget.",
    );
  }
}

function hasNestedCard(source: string): boolean {
  return [
    ...source.matchAll(
      /<article\b[^>]*className=["'][^"']*rounded-[^"']*["'][^>]*>([\s\S]*?)<\/article>/gi,
    ),
  ].some((match) => /rounded-/.test(match[1] ?? ""));
}

function inspectAssertions(
  input: { kit: GeneratedSiteDesignKitV2 },
  routeFiles: GeneratedProjectFile[],
  addHard: AddHard,
): void {
  const source = routeFiles.map((file) => file.content).join("\n");
  for (const assertion of input.kit.sourceAssertions) {
    if (!sourceAssertionSatisfied(assertion, source)) {
      addHard(
        "contract",
        "high",
        "missing-source-assertion",
        `Required source assertion ${assertion} is not evidenced.`,
      );
    }
  }
  for (const assertion of input.kit.browserAssertions) {
    if (!browserAssertionSatisfied(assertion, source)) {
      addHard(
        "contract",
        "high",
        "missing-browser-assertion",
        `Required browser assertion ${assertion} is not evidenced.`,
      );
    }
  }
}

function inspectThemeChecks(
  themeChecks: ThemeContrastCheck[],
  addHard: AddHard,
): void {
  for (const check of themeChecks) {
    if (!check.pass) {
      addHard(
        "accessibility",
        "critical",
        "theme-contrast",
        `${check.role} contrast is below its minimum.`,
      );
    }
  }
}

function inspectProfessionalSignals(
  input: { kit: GeneratedSiteDesignKitV2; plan: WriterDesignPlanV3 },
  routeFiles: GeneratedProjectFile[],
  addSignal: AddSignal,
): void {
  for (const file of routeFiles) {
    const source = file.content;
    const sectionClasses = [
      ...source.matchAll(
        /data-section-id=["'][^"']+["'][^>]*className=["']([^"']+)["']/gi,
      ),
    ].map((match) => match[1] ?? "");
    const spacing = sectionClasses.map(
      (classes) =>
        classes.match(/\b(?:p|py|my|mb|mt)-[\w[\]./-]+/g)?.join(" ") ?? "",
    );
    if (spacing.length >= 3 && new Set(spacing).size === 1) {
      addSignal(
        "uniform-section-spacing",
        file.path,
        `${spacing.length} sections share spacing ${spacing[0] ?? "unknown"}`,
      );
    }
    const treatmentValues = [
      ...source.matchAll(/data-treatment=["']([^"']+)["']/gi),
    ].map((match) => match[1]);
    if (treatmentValues.length >= 3 && new Set(treatmentValues).size === 1) {
      addSignal(
        "equal-treatment-run",
        file.path,
        `${treatmentValues.length} consecutive sections use ${treatmentValues[0] ?? "one treatment"}`,
      );
    }
    const cardCount =
      (source.match(/<article\b/gi)?.length ?? 0) +
      (source.match(/rounded-[\w[\]./-]+\s+border/gi)?.length ?? 0);
    if (cardCount >= 3) {
      addSignal(
        "card-repetition",
        file.path,
        `${cardCount} repeated article/card markers`,
      );
    }
    const longText = source.match(/>[^<{\n]{140,}</g);
    if (longText) {
      addSignal(
        "long-prose",
        file.path,
        `${longText.length} JSX text run(s) exceed the body measure`,
      );
    }
    if (/<h[1-6]\b(?![^>]*\btext-(?:[2-9]xl|\[[^\]]+\]))[^>]*>/i.test(source)) {
      addSignal(
        "weak-heading-scale",
        file.path,
        "heading has no explicit display scale",
      );
    }
    if (
      countAttribute(source, "data-signature") === 1 &&
      invalidHook(source, "data-signature")
    ) {
      addSignal(
        "empty-signature-node",
        file.path,
        "signature hook has no visible site binding",
      );
    }
    const sectionCount = countAttribute(source, "data-section-id");
    const accentCount = (source.match(/\bbg-accent(?:\/[^\s"']+)?\b/g) ?? [])
      .length;
    if (
      sectionCount > 0 &&
      accentCount / sectionCount > input.kit.themePolicy.accentSurfaceMaximum
    ) {
      addSignal(
        "accent-surface-share",
        file.path,
        `${accentCount} accent surface marker(s) across ${sectionCount} section(s)`,
      );
    }
    if (
      input.plan.routes.some(
        (route) =>
          route.sections.length > 2 &&
          new Set(
            route.sections.map(
              (section) => `${section.treatment}:${section.surface}`,
            ),
          ).size === 1,
      )
    ) {
      addSignal(
        "equal-treatment-run",
        file.path,
        "plan assigns one treatment and surface to a long section run",
      );
    }
  }
}

function checkDuplicatePaths(
  files: GeneratedProjectFile[],
  addHard: AddHard,
): void {
  const seen = new Map<string, string>();
  for (const file of files) {
    const normalized = file.path.toLocaleLowerCase("en-US");
    const prior = seen.get(normalized);
    if (prior && prior !== file.path) {
      addHard(
        "contract",
        "critical",
        "duplicate-case-insensitive-path",
        `Generated paths differ only by case: ${prior} and ${file.path}.`,
        file.path,
      );
    } else {
      seen.set(normalized, file.path);
    }
  }
}

function checkProtectedFiles(
  files: GeneratedProjectFile[],
  starterFiles: GeneratedProjectFile[],
  addHard: AddHard,
): void {
  const starter = new Map(
    starterFiles.map((file) => [file.path, file.content]),
  );
  for (const file of files) {
    if (
      !PROTECTED_PATHS.has(file.path) ||
      COMPILED_PROTECTED_PATHS.has(file.path)
    ) {
      continue;
    }
    if (!starter.has(file.path) || starter.get(file.path) !== file.content) {
      addHard(
        "contract",
        "critical",
        "protected-file-emitted",
        `Protected scaffold file ${file.path} is not the platform-owned version.`,
        file.path,
      );
    }
  }
}

function inspectEditablePaths(
  input: {
    blueprint: ProfessionalSiteBlueprintV1;
    files: GeneratedProjectFile[];
    starterFiles: GeneratedProjectFile[];
  },
  addHard: AddHard,
): void {
  const allowed = new Set(
    input.blueprint.routes.map((route) => route.filePath),
  );
  if (input.blueprint.pageStrategy.mode === "multi") {
    allowed.add("src/components/site/generated-shell.tsx");
  }
  const starterPaths = new Set(input.starterFiles.map((file) => file.path));
  for (const file of input.files) {
    if (
      starterPaths.has(file.path) ||
      COMPILED_PROTECTED_PATHS.has(file.path) ||
      allowed.has(file.path)
    ) {
      continue;
    }
    addHard(
      "contract",
      "critical",
      "unexpected-writable-path",
      `Generated output contains an unapproved writable path: ${file.path}.`,
      file.path,
    );
  }
}

function inspectCompiledProtectedFiles(
  files: GeneratedProjectFile[],
  blueprint: ProfessionalSiteBlueprintV1,
  addHard: AddHard,
): void {
  const theme = files.find((file) => file.path === "src/index.css")?.content;
  if (!theme) {
    addHard(
      "contract",
      "critical",
      "protected-file-missing",
      "Compiled src/index.css is missing.",
      "src/index.css",
    );
  } else if (
    !theme.includes("--site-font-display") ||
    !theme.includes("--site-font-body") ||
    !theme.includes("--primary:")
  ) {
    addHard(
      "contract",
      "critical",
      "protected-file-emitted",
      "Compiled src/index.css is not the platform-owned semantic theme.",
      "src/index.css",
    );
  }
  const router = files.find((file) => file.path === "src/router.tsx")?.content;
  if (!router) {
    addHard(
      "contract",
      "critical",
      "protected-file-missing",
      "Compiled src/router.tsx is missing.",
      "src/router.tsx",
    );
  } else if (
    !router.includes("createHashHistory") ||
    !router.includes("createRouter") ||
    blueprint.routes.some(
      (route) => !router.includes(`path: ${JSON.stringify(route.path)}`),
    )
  ) {
    addHard(
      "contract",
      "critical",
      "protected-file-emitted",
      "Compiled src/router.tsx is not the protected hash-history route table.",
      "src/router.tsx",
    );
  }
}

function isGeneratedRoutePath(path: string): boolean {
  return (
    path.startsWith(GENERATED_ROUTE_PREFIX) &&
    path.endsWith(".tsx") &&
    !path.endsWith("/__root.tsx") &&
    !path.endsWith("/not-found.tsx") &&
    path !== "src/routes/__root.tsx" &&
    path !== "src/routes/not-found.tsx"
  );
}

function countAttribute(source: string, name: string): number {
  return [...source.matchAll(DATA_ATTRIBUTE(name))].length;
}

function countExactAttribute(
  source: string,
  name: string,
  value: string,
): number {
  return [
    ...source.matchAll(
      new RegExp(`\\b${name}\\s*=\\s*["']${escapeRegExp(value)}["']`, "gi"),
    ),
  ].length;
}

function hasAnyHook(source: string): boolean {
  return (
    countAttribute(source, "data-first-view") > 0 ||
    countAttribute(source, "data-primary-action") > 0 ||
    countAttribute(source, "data-signature") > 0
  );
}

function invalidHook(source: string, name: string): boolean {
  const open = source.match(
    new RegExp(
      `<([A-Za-z][\\w.]*)\\b[^>]*${escapeRegExp(name)}(?:\\s*=\\s*(?:["'][^"']*["']|\\{[^}]*\\}))?[^>]*>`,
      "i",
    ),
  );
  if (!open) {
    return true;
  }
  const opening = open[0];
  if (
    /aria-hidden\s*=\s*["']true["']|\bhidden\b|\b(?:hidden|invisible|sr-only)\b/i.test(
      opening,
    )
  ) {
    return true;
  }
  if (/\/>\s*$/.test(opening)) {
    return true;
  }
  const tag = open[1];
  const close = tag
    ? source.indexOf(`</${tag}>`, (open.index ?? 0) + opening.length)
    : -1;
  const body =
    close >= 0 ? source.slice((open.index ?? 0) + opening.length, close) : "";
  return (
    !/site\.|\{[^}]+\}/.test(body) &&
    body.replace(/<[^>]+>/g, "").trim().length === 0
  );
}

function hasLargeBlankFirstView(source: string): boolean {
  const match = source.match(
    /<[^>]*data-first-view[^>]*className=["']([^"']+)["'][^>]*>/i,
  );
  return Boolean(
    match &&
    /min-h-(?:\[|screen|dvh)|aspect-(?:square|video)/.test(match[1] ?? "") &&
    !/site\./.test(source.slice(match.index ?? 0, (match.index ?? 0) + 500)),
  );
}

function hasSitePath(source: string, path: string): boolean {
  return new RegExp(`\\b${escapeRegExp(path)}\\b`).test(source);
}

function populatedContentPaths(
  content: GeneratedSiteWriterContractV3["content"],
): string[] {
  const values: Array<[string, unknown]> = [
    ["site.businessName", content.businessName],
    ["site.heroTitle", content.heroTitle],
    ["site.audience", content.audience],
    ["site.offers", content.offers],
    ["site.usp", content.usp],
    ["site.testimonials", content.testimonials],
    ["site.certifications", content.certifications],
    ["site.hours", content.hours],
    ["site.paymentMethods", content.paymentMethods],
    ["site.priceRange", content.priceRange],
    ["site.address", content.address],
    ["site.deliveryArea", content.deliveryArea],
    ["site.socialLinks", content.socialLinks],
    ["site.promotion", content.promotion],
    ["site.primaryCta", content.primaryCta],
    ["site.secondaryCta", content.secondaryCta],
    ["site.navigation", content.navigation],
    ["site.otherFacts", content.otherFacts],
  ];
  return values.filter(([, value]) => isPopulated(value)).map(([path]) => path);
}

function isPopulated(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return value !== null && value !== undefined;
}

function inspectCustomerSource(
  routeFiles: GeneratedProjectFile[],
  shellFiles: GeneratedProjectFile[],
  addHard: AddHard,
): void {
  for (const file of [...routeFiles, ...shellFiles]) {
    const violations = findCustomerSourceViolations(file.content);
    for (const violation of violations) {
      addHard(
        "content",
        "critical",
        violation.code,
        violation.message,
        file.path,
      );
    }
  }
}

type CustomerViolation = { code: string; message: string };

function findCustomerSourceViolations(source: string): CustomerViolation[] {
  const sourceFile = ts.createSourceFile(
    "generated-site.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const violations: CustomerViolation[] = [];
  const pushText = (value: string, code = "hard-coded-customer-copy"): void => {
    if (hasCustomerCharacters(value)) {
      violations.push({
        code,
        message:
          "Generated JSX contains hard-coded customer-facing prose instead of accepted site.* data.",
      });
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      pushText(node.getText(sourceFile));
    }
    if (ts.isJsxAttribute(node)) {
      const name = ts.isIdentifier(node.name)
        ? node.name.text
        : node.name.getText(sourceFile);
      if (name === "dangerouslySetInnerHTML") {
        violations.push({
          code: "dangerously-set-inner-html",
          message: "Generated JSX uses dangerouslySetInnerHTML.",
        });
      }
      if (name === "alt" || name === "aria-label" || name === "title") {
        if (node.initializer && ts.isStringLiteral(node.initializer)) {
          pushText(node.initializer.text);
        } else if (
          node.initializer &&
          ts.isJsxExpression(node.initializer) &&
          node.initializer.expression &&
          containsStringLiteral(node.initializer.expression, sourceFile)
        ) {
          pushText(node.initializer.expression.getText(sourceFile));
        }
      }
    }
    if (ts.isJsxExpression(node) && isJsxChildExpression(node)) {
      if (
        node.expression &&
        containsCustomerString(node.expression, sourceFile)
      ) {
        pushText(node.expression.getText(sourceFile));
      }
    }
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      !isSiteDeclaration(node)
    ) {
      if (
        (ts.isArrayLiteralExpression(node.initializer) ||
          ts.isObjectLiteralExpression(node.initializer)) &&
        displayDataLiteral(node.initializer, sourceFile)
      ) {
        violations.push({
          code: "local-display-data",
          message:
            "Generated source declares a local customer display-data array or object.",
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (/\bcontent-\[[^\]]+\]|\bcontent\s*:\s*["']/i.test(source)) {
    violations.push({
      code: "generated-content-bypass",
      message: "Generated source uses CSS/Tailwind generated content.",
    });
  }
  return uniqueViolations(violations);
}

function isJsxChildExpression(node: ts.JsxExpression): boolean {
  return ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent);
}

function containsCustomerString(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (
      ts.isStringLiteral(child) ||
      ts.isNoSubstitutionTemplateLiteral(child)
    ) {
      if (hasCustomerCharacters(child.text)) {
        found = true;
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found && !isOnlyPunctuationExpression(node, sourceFile);
}

function containsStringLiteral(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): boolean {
  return containsCustomerString(node, sourceFile);
}

function isOnlyPunctuationExpression(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): boolean {
  const text = node.getText(sourceFile);
  return /^\s*["'`]?([\s\p{P}\p{S}]*)["'`]?\s*$/u.test(text);
}

function displayDataLiteral(
  node: ts.ArrayLiteralExpression | ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
): boolean {
  const text = node.getText(sourceFile);
  if (
    !/["']/.test(text) ||
    /https?:\/\/|^\s*["']\/?[a-z0-9/_-]+["']\s*$/i.test(text)
  ) {
    return false;
  }
  return (
    /\b(?:name|title|label|description|body|quote|text|price|items|cards|products|features|steps)\b/i.test(
      text,
    ) &&
    [...text.matchAll(/"([^"\n]+)"|'([^'\n]+)'/g)].some((match) =>
      hasCustomerCharacters(match[1] ?? match[2] ?? ""),
    )
  );
}

function isSiteDeclaration(node: ts.VariableDeclaration): boolean {
  return ts.isIdentifier(node.name) && node.name.text === "site";
}

function hasCustomerCharacters(value: string): boolean {
  const normalized = value.replace(/\s+/g, "").trim();
  return normalized.length > 0 && /[\p{L}]/u.test(normalized);
}

function sourceAssertionSatisfied(assertion: string, source: string): boolean {
  switch (assertion) {
    case "bold-display-role":
    case "editorial-display-role":
    case "menu-row-rhythm":
      return source.includes("font-display");
    case "high-contrast-action":
    case "commerce-split-hero":
      return source.includes("data-primary-action");
    case "sparse-content-respected":
    case "airy-section-rhythm":
    case "single-feature-band":
      return source.includes("data-first-view");
    case "computed-contrast":
    case "priced-content-visible":
    case "operational-detail-band":
    case "asymmetric-hero":
    case "product-comparison-rhythm":
    case "catalog-story-rail":
    case "varied-decision-surfaces":
    case "contrast-action-close":
      return true;
    default:
      return source.includes(assertion);
  }
}

function browserAssertionSatisfied(assertion: string, source: string): boolean {
  switch (assertion) {
    case "primary-cta":
    case "touch-target":
      return (
        source.includes("data-primary-action") && /min-h-(?:11|12)/.test(source)
      );
    case "computed-contrast":
    case "heading-overflow":
    case "horizontal-overflow":
    case "content-hidden-by-navigation":
      return true;
    default:
      return source.includes(assertion);
  }
}

function approvedMediaSource(
  src: string,
  contract: GeneratedSiteWriterContractV3,
): boolean {
  if (contract.media.mode !== "owner_assets") {
    return false;
  }
  return contract.media.approvedAssets.some(
    (asset) => src === asset.mediaPath || src === `/media/${asset.assetId}`,
  );
}

function parseSiteValue(content: string): Record<string, unknown> | null {
  const match = content.match(
    /export const site\s*=\s*([\s\S]+?)(?:\s+as const)?;\s*(?:export default site;)?/,
  );
  if (!match) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(match[1] ?? "");
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function uniqueViolations(values: CustomerViolation[]): CustomerViolation[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.code}:${value.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const STARTER_MARKER =
  /Replace this with the real home page built from the brief|data-generated-site-starter/i;

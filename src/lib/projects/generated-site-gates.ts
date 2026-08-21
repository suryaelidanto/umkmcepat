import ts from "typescript";

import { type WriterDesignPlanV1 } from "./batched-response";
import {
  type GeneratedSiteContractV1,
  type GeneratedSiteWriterContractV2,
} from "./generated-site-contract";
import { type GeneratedSiteDesignKitV1 } from "./generated-site-design-kits/types";
import { type WriterDesignPlanV2 } from "./generated-site-design-plan";
import { type GeneratedProjectFile } from "./generated-types";
import { generatedRouteBinding } from "./professional-site-router";

const ALLOWED_GENERATED_STRUCTURAL_LABELS = new Set([
  "Beranda",
  "Menu",
  "Layanan",
  "Lokasi",
  "Kontak",
  "Tentang",
  "Kembali",
  "Selanjutnya",
  "Buka menu",
  "Tutup menu",
  "Navigasi utama",
  "Langsung ke konten",
]);

export function findGeneratedCustomerLiteralIssues(
  files: GeneratedProjectFile[],
): string[] {
  const issues: string[] = [];
  for (const file of files) {
    if (
      !file.path.endsWith(".tsx") ||
      file.path.includes("/ui/") ||
      file.path === "src/routes/not-found.tsx" ||
      file.path === "src/routes/__root.tsx"
    ) {
      continue;
    }
    for (const match of file.content.matchAll(/>([^<>{}]+)</g)) {
      const literal = match[1].replace(/\s+/g, " ").trim();
      if (
        !literal ||
        /^[\p{P}\p{S}\d\s]+$/u.test(literal) ||
        ALLOWED_GENERATED_STRUCTURAL_LABELS.has(literal) ||
        !/\b(?:jaminan|garansi|nomor\s*satu|terbaik|paling\s+diminati|100%|tanpa\s+risiko)\b/i.test(
          literal,
        )
      ) {
        continue;
      }
      issues.push(`${file.path}: unsupported customer claim: ${literal}`);
    }
  }
  return issues;
}
import type { ThemeContrastCheck } from "./scaffold/shadcn-theme";

const SURFACE_TOKEN_AS_TEXT = /\btext-(?:muted|card|popover|secondary)\b(?!-)/;

const LIGHT_SURFACE_TEXT_TOKEN =
  "foreground|muted-foreground|card-foreground|popover-foreground|secondary-foreground";
const FOREGROUND_FAMILY_TEXT_TOKEN = `text-(?:${LIGHT_SURFACE_TEXT_TOKEN})`;

function findMatchingClose(
  source: string,
  searchFrom: number,
  tagName: string,
): number {
  const marker = new RegExp(`<${tagName}\\b|</${tagName}>`, "g");
  marker.lastIndex = searchFrom;
  let depth = 1;
  let match: RegExpExecArray | null;
  while (depth > 0 && (match = marker.exec(source))) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        return match.index;
      }
    } else {
      depth += 1;
    }
  }
  return source.length;
}

function elementSpan(
  source: string,
  match: RegExpMatchArray,
  tagName: string,
): { start: number; end: number } {
  const start = match.index ?? 0;
  const tagEnd = start + match[0].length;
  if (/\/\s*>$/.test(match[0])) {
    return { start, end: tagEnd };
  }
  return { start, end: findMatchingClose(source, tagEnd, tagName) };
}

function contrastSurfaceSpans(
  source: string,
): Array<{ start: number; end: number }> {
  const sectionSpans = [
    ...source.matchAll(/<SiteSection\b[^>]*\bsurface=["']contrast["'][^>]*>/g),
  ].map((match) => elementSpan(source, match, "SiteSection"));
  // Scan any element with bg-foreground in className string or template literal
  const elementSpans = [
    ...source.matchAll(
      /<([A-Za-z][\w.]*)\b[^>]*\bclassName=(?:\{`|["'])[^"'`]*\bbg-foreground\b[^"'`]*(?:`\}|["'])[^>]*>/g,
    ),
  ].flatMap((match) =>
    match[1] ? [elementSpan(source, match, match[1])] : [],
  );
  return [...sectionSpans, ...elementSpans];
}

function hasContrastSurfaceTextMismatch(source: string): boolean {
  const pattern = new RegExp(`\\b${FOREGROUND_FAMILY_TEXT_TOKEN}\\b`);
  return contrastSurfaceSpans(source).some(({ start, end }) =>
    pattern.test(source.slice(start, end)),
  );
}

function hasMisplacedBackgroundText(source: string): boolean {
  const spans = contrastSurfaceSpans(source);
  const pattern = /\btext-background\b(?!-)/g;
  for (const match of source.matchAll(pattern)) {
    const offset = match.index ?? 0;
    if (!spans.some((span) => offset >= span.start && offset < span.end)) {
      return true;
    }
  }
  return false;
}

function healContrastSurfaceText(content: string): string {
  let normalized = content;
  normalized = normalized.replace(
    /<SiteSection\b(?=[^>]*\bsurface=["']contrast["'])[^>]*>([\s\S]*?)<\/SiteSection>/gi,
    (sectionMatch: string) => {
      return sectionMatch.replace(
        /\btext-(?:foreground|muted-foreground|card-foreground|popover-foreground|secondary-foreground)\b(?!-)(\/\d{1,3})?/g,
        (_match, opacity) => `text-background${opacity ?? ""}`,
      );
    },
  );

  const spans = contrastSurfaceSpans(normalized);
  const pattern = new RegExp(
    `\\btext-(background|(?:${LIGHT_SURFACE_TEXT_TOKEN}))\\b(?!-)(/\\d{1,3})?`,
    "g",
  );
  return normalized.replace(
    pattern,
    (
      match: string,
      token: string,
      opacity: string | undefined,
      offset: number,
    ) => {
      const inScope = spans.some(
        (span) => offset >= span.start && offset < span.end,
      );
      if (token === "background") {
        return inScope ? match : `text-foreground${opacity ?? ""}`;
      }
      return inScope ? `text-background${opacity ?? ""}` : match;
    },
  );
}

function accentSurfaceSpans(
  source: string,
): Array<{ start: number; end: number; token: "accent" | "primary" }> {
  return [
    ...source.matchAll(
      /<([A-Za-z][\w.]*)\b[^>]*\bclassName=["'][^"']*\bbg-(accent|primary)\b[^"']*["'][^>]*>/g,
    ),
  ].flatMap((match) =>
    match[1] && (match[2] === "accent" || match[2] === "primary")
      ? [{ ...elementSpan(source, match, match[1]), token: match[2] }]
      : [],
  );
}

const WRONG_TEXT_ON_ACCENT_OR_PRIMARY = new RegExp(
  `\\btext-(?:background|${LIGHT_SURFACE_TEXT_TOKEN})\\b(?!-)`,
);

function hasAccentSurfaceTextMismatch(source: string): boolean {
  return accentSurfaceSpans(source).some(({ start, end }) =>
    WRONG_TEXT_ON_ACCENT_OR_PRIMARY.test(source.slice(start, end)),
  );
}

function healAccentSurfaceText(content: string): string {
  const spans = accentSurfaceSpans(content);
  if (!spans.length) {
    return content;
  }
  const pattern = new RegExp(
    `\\btext-(?:background|${LIGHT_SURFACE_TEXT_TOKEN})\\b(?!-)(/\\d{1,3})?`,
    "g",
  );
  return content.replace(
    pattern,
    (match: string, opacity: string | undefined, offset: number) => {
      const span = spans.find(
        (candidate) => offset >= candidate.start && offset < candidate.end,
      );
      return span ? `text-${span.token}-foreground${opacity ?? ""}` : match;
    },
  );
}

function healDynamicContrastSurfaceText(content: string): string {
  const candidates = [
    ...content.matchAll(
      /<([A-Za-z][\w.]*)\b(?=[^>]*\bclassName=\{`)(?=[^>]*\bbg-foreground\b)[^>]*>/g,
    ),
  ].flatMap((match) =>
    match[1] ? [elementSpan(content, match, match[1])] : [],
  );
  const spans = candidates.filter(
    (span, index) =>
      !candidates.some(
        (other, otherIndex) =>
          index !== otherIndex &&
          other.start <= span.start &&
          other.end >= span.end,
      ),
  );
  const pattern = new RegExp(
    `\\btext-(?:${LIGHT_SURFACE_TEXT_TOKEN})\\b(?!-)(/\\d{1,3})?`,
    "g",
  );
  let normalized = content;
  for (const span of spans.sort((left, right) => right.start - left.start)) {
    const fragment = normalized
      .slice(span.start, span.end)
      .replace(
        pattern,
        (_match: string, opacity: string | undefined) =>
          `text-background${opacity ?? ""}`,
      );
    normalized = `${normalized.slice(0, span.start)}${fragment}${normalized.slice(span.end)}`;
  }
  return normalized;
}

const LIGHT_SURFACE_KINDS = ["background", "muted", "card", "popover"] as const;
const STRONG_SURFACE_KINDS = ["accent", "foreground", "primary"] as const;
type LightSurfaceKind = (typeof LIGHT_SURFACE_KINDS)[number];
type GeneratedSurfaceKind =
  LightSurfaceKind | (typeof STRONG_SURFACE_KINDS)[number];

const STRUCTURED_ARRAY_DISPLAY_FIELDS = [
  ["paymentMethods", "method"],
  ["socialLinks", "handle"],
  ["products", "name"],
  ["testimonials", "quote"],
  ["faq", "q"],
] as const;

function isGeneratedSurfaceKind(value: string): value is GeneratedSurfaceKind {
  return [...LIGHT_SURFACE_KINDS, ...STRONG_SURFACE_KINDS].includes(
    value as GeneratedSurfaceKind,
  );
}

function isLightSurfaceKind(
  value: GeneratedSurfaceKind,
): value is LightSurfaceKind {
  return LIGHT_SURFACE_KINDS.includes(value as LightSurfaceKind);
}

function generatedSurfaceClassSpans(
  source: string,
  kinds: readonly GeneratedSurfaceKind[],
): Array<{
  start: number;
  end: number;
  kind: GeneratedSurfaceKind;
}> {
  const kindPattern = kinds.join("|");
  const openingTagPatterns = [
    new RegExp(
      `<([A-Za-z][\\w.]*)\\b[^>]*\\bclassName=["'][^"']*\\bbg-(${kindPattern})\\b[^"']*["'][^>]*>`,
      "g",
    ),
    new RegExp(
      `<([A-Za-z][\\w.]*)\\b[^>]*\\bclassName=\\{\`[^\`]*\\bbg-(${kindPattern})\\b[^\`]*\`[^>]*>`,
      "g",
    ),
  ];
  return openingTagPatterns.flatMap((pattern) =>
    [...source.matchAll(pattern)].flatMap((match) => {
      const tagName = match[1];
      const kind = match[2];
      return tagName && kind && isGeneratedSurfaceKind(kind)
        ? [{ ...elementSpan(source, match, tagName), kind }]
        : [];
    }),
  );
}

function healNestedLightSurfaceText(content: string): string {
  const surfaceSpans = [
    ...generatedSurfaceClassSpans(content, LIGHT_SURFACE_KINDS),
    ...generatedSurfaceClassSpans(content, STRONG_SURFACE_KINDS),
  ];
  const pattern = /\btext-background\b(?!-)(\/\d{1,3})?/g;
  let normalized = content;
  for (const match of [...content.matchAll(pattern)].reverse()) {
    const offset = match.index ?? 0;
    const nearestSurface = surfaceSpans
      .filter((span) => offset >= span.start && offset < span.end)
      .sort((left, right) => {
        if (left.start !== right.start) {
          return right.start - left.start;
        }
        return (
          Number(isLightSurfaceKind(left.kind)) -
          Number(isLightSurfaceKind(right.kind))
        );
      })[0];
    if (nearestSurface && isLightSurfaceKind(nearestSurface.kind)) {
      const textToken =
        nearestSurface.kind === "background"
          ? "foreground"
          : `${nearestSurface.kind}-foreground`;
      const replacement = `text-${textToken}${match[1] ?? ""}`;
      const start = offset;
      const end = start + match[0].length;
      normalized = `${normalized.slice(0, start)}${replacement}${normalized.slice(end)}`;
    }
  }
  return normalized;
}

function normalizeStructuredArraySerializations(content: string): string {
  let normalized = STRUCTURED_ARRAY_DISPLAY_FIELDS.reduce(
    (acc, [field, displayField]) =>
      acc.replace(
        new RegExp(`\\bsite\\.${field}\\s*\\.\\s*join\\s*\\(`, "g"),
        `site.${field}.map((item) => item.${displayField}).join(`,
      ),
    content,
  );
  // Normalize any mapping over structured arrays
  normalized = normalized.replace(
    /site\.sections\.map\(\(([A-Za-z0-9_]+)(?:,\s*[A-Za-z0-9_]+)?\)\s*=>\s*<([A-Za-z0-9_]+)([\s\S]*?)<\/\2>\)/g,
    (_match: string, param: string, tag: string, inside: string) => {
      const fixedInside = inside
        .replace(
          new RegExp(`key=\\{${param}\\}`, "g"),
          `key={typeof ${param} === "string" ? ${param} : ${param}?.title || ${param}?.name || JSON.stringify(${param})}`,
        )
        .replace(
          new RegExp(`\\{${param}\\}`, "g"),
          `{typeof ${param} === "string" ? ${param} : ${param}?.title || ${param}?.name || ${param}?.body || ""}`,
        );
      return `site.sections.map((${param}: any) => <${tag}${fixedInside}</${tag}>)`;
    },
  );
  normalized = normalized.replace(
    /site\.sections\.map\(\(([A-Za-z0-9_]+)(?:,\s*[A-Za-z0-9_]+)?\)\s*=>\s*\(([\s\S]*?)\)\)/g,
    (_match: string, param: string, body: string) => {
      const fixedBody = body
        .replace(
          new RegExp(`key=\\{${param}\\}`, "g"),
          `key={typeof ${param} === "string" ? ${param} : ${param}?.title || ${param}?.name || JSON.stringify(${param})}`,
        )
        .replace(
          new RegExp(`\\{${param}\\}`, "g"),
          `{typeof ${param} === "string" ? ${param} : ${param}?.title || ${param}?.name || ${param}?.body || ""}`,
        );
      return `site.sections.map((${param}: any) => (${fixedBody}))`;
    },
  );
  normalized = normalized.replace(
    /<pre[^>]*>\s*\{JSON\.stringify\([^}]+\)\}\s*<\/pre>/gi,
    "",
  );
  normalized = normalized.replace(
    /\{typeof\s+([A-Za-z0-9_]+)\s*===\s*["']string["']\s*\?\s*\1\s*:\s*JSON\.stringify\(\1\)\}/g,
    (_match: string, variable: string) =>
      `{typeof ${variable} === "string" ? ${variable} : (${variable} as any)?.title || (${variable} as any)?.name || (${variable} as any)?.method || (${variable} as any)?.quote || ""}`,
  );
  normalized = normalized.replace(
    /\{JSON\.stringify\(([A-Za-z0-9_]+)\)\}/g,
    (_match: string, variable: string) =>
      `{typeof ${variable} === "string" ? ${variable} : (${variable} as any)?.title || (${variable} as any)?.name || (${variable} as any)?.method || (${variable} as any)?.quote || ""}`,
  );
  return normalized;
}

export function inspectGeneratedSiteTasteSource(input: {
  source: string;
  sectionCount: number;
}): GeneratedSiteGateFinding[] {
  const findings: GeneratedSiteGateFinding[] = [];
  if (/\bh-screen\b/.test(input.source)) {
    add(
      findings,
      "contract",
      "high",
      "viewport-stability",
      "Generated route uses h-screen instead of a mobile-stable min-h-dvh layout.",
    );
  }
  // A spaced dash ("word — word") is the AI phrasing tic this exists to
  if (/\s[—–]|[—–]\s/.test(input.source)) {
    add(
      findings,
      "language",
      "high",
      "llm-dash-tell",
      "Generated customer copy contains an em or en dash design tell.",
    );
  }
  const classNames = [
    ...input.source.matchAll(/className=["']([^"']+)["']/g),
  ].map((match) => match[1]);
  const eyebrowCount = classNames.filter(
    (className) =>
      /\buppercase\b/.test(className) &&
      /\btracking(?:-[\w[\].-]+)?\b/.test(className),
  ).length;
  const allowedEyebrows = Math.max(1, Math.ceil(input.sectionCount / 3));
  if (eyebrowCount > allowedEyebrows) {
    add(
      findings,
      "genericness",
      "high",
      "eyebrow-overuse",
      `Generated route uses ${eyebrowCount} tracked uppercase labels; at most ${allowedEyebrows} is allowed for ${input.sectionCount} sections.`,
    );
  }
  const numberedMarkers = [
    ...input.source.matchAll(/>\s*(?:0[1-9]|1[0-9])\s*</g),
  ].length;
  if (numberedMarkers >= 3) {
    add(
      findings,
      "genericness",
      "high",
      "numbered-scaffolding",
      "Generated route uses repeated numbered markers without a proven ordered process.",
    );
  }
  if (/<h[1-6][^>]*className=["'][^"']*\bfont-mono\b/i.test(input.source)) {
    add(
      findings,
      "genericness",
      "medium",
      "technical-display-type",
      "Generated headings use a technical monospace treatment without a kit justification.",
    );
  }
  if (
    /\bsite\.theme\.(?:background|foreground|muted|accent)\b/.test(
      input.source,
    ) ||
    /style=\{\{[^}]*\b(?:color|background|backgroundColor)\b/.test(input.source)
  ) {
    add(
      findings,
      "accessibility",
      "high",
      "compiled-theme-bypass",
      "Generated route reads or declares palette colors instead of using compiled semantic theme tokens.",
    );
  }
  if (
    /\b(?:bg|text|border)-(?:white|black|gray(?:-[\w/]+)?|slate(?:-[\w/]+)?|zinc(?:-[\w/]+)?|stone(?:-[\w/]+)?|neutral(?:-[\w/]+)?)\b/.test(
      input.source,
    ) ||
    SURFACE_TOKEN_AS_TEXT.test(input.source) ||
    hasContrastSurfaceTextMismatch(input.source) ||
    hasMisplacedBackgroundText(input.source) ||
    hasAccentSurfaceTextMismatch(input.source)
  ) {
    add(
      findings,
      "accessibility",
      "high",
      "uncompiled-theme-utility",
      "Generated route uses a generic color utility instead of the compiled semantic theme tokens.",
    );
  }
  if (/\bborder-(?:l|r)-(?:2|3|4|5|6|8|\[[^\]]+\])\b/.test(input.source)) {
    add(
      findings,
      "genericness",
      "high",
      "side-stripe",
      "Generated route uses a thick colored side stripe instead of a complete boundary or visual grouping.",
    );
  }
  return findings;
}

export function inspectReferenceCalibratedSiteSource(input: {
  contract: GeneratedSiteWriterContractV2;
  kit: GeneratedSiteDesignKitV1;
  designPlan: WriterDesignPlanV2 | null;
  files: GeneratedProjectFile[];
  starterIndexSource: string;
  themeChecks: ThemeContrastCheck[];
}): GeneratedSiteSourceGateReportV1 {
  const findings: GeneratedSiteGateFinding[] = [];
  const riskSignals: GeneratedSiteGateFinding[] = [];
  const source = input.files
    .filter((file) => file.path.endsWith(".tsx"))
    .map((file) => file.content)
    .join("\n");
  const index = input.files.find(
    (file) => file.path === "src/routes/index.tsx",
  )?.content;
  const routeBindings = input.contract.obligations.routes.map((route) =>
    generatedRouteBinding(route.path),
  );
  const filesByPath = new Map(input.files.map((file) => [file.path, file]));
  const router = filesByPath.get("src/router.tsx")?.content;
  if (!input.designPlan) {
    add(
      findings,
      "contract",
      "critical",
      "missing-design-plan-v2",
      "V2 writer response omitted its design plan.",
    );
  } else if (
    input.designPlan.contractHash !== input.contract.contractHash ||
    input.designPlan.kit.id !== input.kit.id ||
    input.designPlan.mediaMode !== input.contract.media.mode ||
    input.designPlan.sectionOrder.length !==
      input.contract.obligations.sections.length ||
    !input.contract.obligations.sections.every((section) =>
      input.designPlan?.sectionOrder.includes(section.id),
    ) ||
    !input.designPlan.sectionOrder.every((id) =>
      input.contract.obligations.sections.some((section) => section.id === id),
    )
  ) {
    add(
      findings,
      "contract",
      "critical",
      "design-plan-v2-mismatch",
      "V2 design plan conflicts with the immutable contract or kit.",
    );
  }
  if (
    !index ||
    STARTER_MARKER.test(index) ||
    index.trim() === input.starterIndexSource.trim()
  ) {
    add(
      findings,
      "starter",
      "critical",
      "starter-residue",
      "Generated route retains the platform starter.",
      "src/routes/index.tsx",
    );
  }
  if (
    index &&
    !/export\s+(?:async\s+)?function\s+HomeRouteComponent\b/.test(index) &&
    !/export\s+(?:const|let)\s+HomeRouteComponent\b/.test(index)
  ) {
    add(
      findings,
      "contract",
      "high",
      "home-route-export-missing",
      "Generated route must export HomeRouteComponent for the platform router.",
      "src/routes/index.tsx",
    );
  }
  if (index && !/usePreviewReady\s*\(\s*\)/.test(index)) {
    add(
      findings,
      "contract",
      "high",
      "preview-ready-hook-missing",
      "Generated route must call usePreviewReady() so the preview iframe can unlock.",
      "src/routes/index.tsx",
    );
  }
  for (const route of routeBindings) {
    const routeSource = filesByPath.get(route.filePath)?.content;
    if (!routeSource) {
      add(
        findings,
        "contract",
        "critical",
        "route-file-missing",
        `Generated contract route ${route.path} is missing its route file.`,
        route.filePath,
      );
      continue;
    }
    const exportsRoute =
      new RegExp(
        `export\\s+(?:async\\s+)?function\\s+${escapeRegExp(route.exportName)}\\b`,
      ).test(routeSource) ||
      new RegExp(
        `export\\s+(?:const|let)\\s+${escapeRegExp(route.exportName)}\\b`,
      ).test(routeSource);
    if (!exportsRoute) {
      add(
        findings,
        "contract",
        "high",
        "route-export-missing",
        `Generated route ${route.path} must export ${route.exportName}.`,
        route.filePath,
      );
    }
    if (!/usePreviewReady\s*\(\s*\)/.test(routeSource)) {
      add(
        findings,
        "contract",
        "high",
        "preview-ready-hook-missing",
        `Generated route ${route.path} must call usePreviewReady() so the preview iframe can unlock.`,
        route.filePath,
      );
    }
    if (
      !containsAcceptedCtaTarget(
        routeSource,
        input.contract.business.primaryCta.target,
      )
    ) {
      add(
        findings,
        "cta",
        "high",
        "route-primary-cta-missing",
        `Generated route ${route.path} must render the accepted primary action.`,
        route.filePath,
      );
    }
  }
  if (!router) {
    add(
      findings,
      "contract",
      "critical",
      "compiled-router-missing",
      "Generated site is missing the platform-compiled route table.",
      "src/router.tsx",
    );
  } else {
    for (const route of routeBindings) {
      const routeImport = `./${route.filePath.replace(/^src\//, "").replace(/\.tsx$/, "")}`;
      if (
        !router.includes(`{ ${route.exportName} } from "${routeImport}"`) ||
        !router.includes(`path: ${JSON.stringify(route.path)}`)
      ) {
        add(
          findings,
          "contract",
          "critical",
          "compiled-router-route-missing",
          `Compiled router does not register ${route.path} with its generated route component.`,
          "src/router.tsx",
        );
      }
    }
  }
  if (routeBindings.length > 1) {
    const shell = filesByPath.get(
      "src/components/site/generated-shell.tsx",
    )?.content;
    if (
      !shell ||
      !/export\s+(?:function|const)\s+GeneratedShell\b/.test(shell)
    ) {
      add(
        findings,
        "contract",
        "critical",
        "shared-shell-missing",
        "Multi-page output must provide the shared GeneratedShell component.",
        "src/components/site/generated-shell.tsx",
      );
    }
    for (const route of routeBindings) {
      const routeSource = filesByPath.get(route.filePath)?.content;
      if (
        routeSource &&
        !routeSource.includes('from "@/components/site/generated-shell"') &&
        !routeSource.includes("from '@/components/site/generated-shell'")
      ) {
        add(
          findings,
          "contract",
          "high",
          "shared-shell-bypass",
          `Multi-page route ${route.path} must use the shared GeneratedShell component.`,
          route.filePath,
        );
      }
    }
  }
  if (
    input.contract.media.mode !== "owner_assets" &&
    PLACEHOLDER.test(source)
  ) {
    add(
      findings,
      "media",
      "critical",
      "placeholder-forbidden",
      "No-photo V2 output cannot contain placeholder images.",
    );
  }
  if (
    input.contract.media.mode !== "owner_assets" &&
    EMPTY_GRAPHIC_FRAME.test(index ?? "")
  ) {
    add(
      findings,
      "media",
      "high",
      "empty-graphic-frame",
      "Image-free output contains an empty framed shape that reads as a missing product image.",
      "src/routes/index.tsx",
    );
  }
  if (!source.includes("@/components/site/layout")) {
    add(
      findings,
      "contract",
      "high",
      "kit-primitive-missing",
      `Generated route does not use the selected ${input.kit.id} primitive.`,
    );
  }
  // A field JSON.stringify dropped (empty optional arrays become undefined)
  const siteValue = parseSiteValue(input.files);
  if (siteValue) {
    for (const file of input.files.filter((candidate) =>
      candidate.path.endsWith(".tsx"),
    )) {
      for (const reference of invalidSiteReferences(file.content, siteValue)) {
        add(
          findings,
          "content",
          "critical",
          "unknown-site-field",
          `Generated source references ${reference}, which is absent from src/content/site.ts.`,
          file.path,
        );
      }
      for (const reference of structuredArraySerializationReferences(
        file.content,
        siteValue,
      )) {
        add(
          findings,
          "content",
          "high",
          "structured-array-serialization",
          `Generated source serializes structured site data through ${reference}; render its display field instead.`,
          file.path,
        );
      }
    }
  }
  if (
    !source.includes(
      input.designPlan?.compositionPatternId ?? "__missing_pattern__",
    )
  ) {
    add(
      findings,
      "contract",
      "high",
      "kit-pattern-missing",
      "Selected composition pattern is not reflected in source.",
    );
  }
  if (source.includes("Pilihan yang mudah dilihat, ditanyakan, dan dipesan.")) {
    add(
      findings,
      "genericness",
      "high",
      "fixed-renderer-fingerprint",
      "Generated route retains the deterministic control copy.",
    );
  }
  for (const claim of input.contract.obligations.prohibitedClaims) {
    if (
      claim.trim() &&
      source.toLocaleLowerCase().includes(claim.toLocaleLowerCase())
    ) {
      add(
        findings,
        "claims",
        "critical",
        "prohibited-claim",
        "Generated source contains a prohibited claim.",
      );
    }
  }
  if (/[#][0-9a-f]{6}/i.test(source)) {
    add(
      findings,
      "accessibility",
      "high",
      "raw-palette-literal",
      "Generated source redeclares a raw palette instead of semantic tokens.",
    );
  }
  findings.push(
    ...inspectGeneratedSiteTasteSource({
      source: routeBindings
        .map((route) => filesByPath.get(route.filePath)?.content ?? "")
        .concat(
          routeBindings.length > 1
            ? [
                filesByPath.get("src/components/site/generated-shell.tsx")
                  ?.content ?? "",
              ]
            : [],
        )
        .join("\n"),
      sectionCount: input.contract.obligations.sections.length,
    }),
  );
  for (const check of input.themeChecks) {
    if (!check.pass) {
      add(
        findings,
        "accessibility",
        "critical",
        "theme-contrast",
        `${check.role} contrast is below its minimum.`,
      );
    }
  }
  const requiredFields = referenceCalibratedRequiredContentFields(
    input.contract,
  );
  for (const field of requiredFields) {
    if (!new RegExp(`\\bsite\\.${escapeRegExp(field)}\\b`).test(source)) {
      add(
        findings,
        "content",
        "high",
        "missing-required-content",
        `Required content site.${field} is not rendered.`,
      );
    }
  }
  const targetDigits = input.contract.business.primaryCta.target.replace(
    /\D/g,
    "",
  );
  const canonicalTargetDigits = targetDigits.startsWith("0")
    ? `62${targetDigits.slice(1)}`
    : targetDigits;
  if (
    targetDigits &&
    !source.includes(targetDigits) &&
    !source.includes(canonicalTargetDigits) &&
    !source.includes(`wa.me/${targetDigits}`) &&
    !source.includes(`wa.me/${canonicalTargetDigits}`)
  ) {
    add(
      findings,
      "cta",
      "critical",
      "primary-cta-target-missing",
      "Primary CTA does not use the accepted target.",
    );
  }
  return {
    version: 1,
    status: findings.length ? "fail" : "pass",
    findings,
    riskSignals,
  };
}

export function findGeneratedInternalLinkIssues(
  files: GeneratedProjectFile[],
): string[] {
  const ids = collectGeneratedStaticIds(files);
  const issues: string[] = [];
  for (const file of files) {
    if (!file.path.endsWith(".tsx")) {
      continue;
    }
    for (const match of file.content.matchAll(
      /(href\s*(?:=|:)\s*)(["'])#([a-z0-9-]+)\2/gi,
    )) {
      const target = match[3];
      if (target && !ids.has(target)) {
        issues.push(`${file.path}: missing #${target}`);
      }
    }
  }
  return issues;
}

export function findGeneratedPrimaryActionIssues(
  files: GeneratedProjectFile[],
): string[] {
  const source = files
    .filter((file) => file.path.endsWith(".tsx"))
    .map((file) => file.content)
    .join("\n");
  if (!source.includes("site.primaryCta")) {
    return [];
  }
  const actionAnchor =
    /<a\b[\s\S]{0,800}?\b(?:site\.primaryCta|primaryCta|primaryCtaTarget|pesan|chat|hubungi|sedekah|konsultasi|whatsapp)[\s\S]{0,400}<\/a>/i;
  return actionAnchor.test(source)
    ? []
    : ["src/routes/index.tsx: primary CTA must be an anchor action"];
}

function collectGeneratedStaticIds(files: GeneratedProjectFile[]): Set<string> {
  const ids = new Set<string>();
  for (const file of files) {
    for (const match of file.content.matchAll(/\bid=["']([a-z0-9-]+)["']/gi)) {
      if (match[1]) {
        ids.add(match[1]);
      }
    }
  }
  return ids;
}

export function normalizeGeneratedInternalLinks(
  files: GeneratedProjectFile[],
): GeneratedProjectFile[] {
  const ids = collectGeneratedStaticIds(files);
  const pageRouteCount = files.filter(
    (file) =>
      file.path.startsWith("src/routes/") &&
      file.path.endsWith(".tsx") &&
      !file.path.endsWith("/__root.tsx") &&
      !file.path.endsWith("/not-found.tsx"),
  ).length;
  const homeAnchor = (target: string) =>
    pageRouteCount > 1 ? `#/#${target}` : `#${target}`;
  const aliases = [
    "-section",
    "-anchor",
    "-target",
    "-content",
    "-link",
    "-box",
  ];
  return files.map((file) => {
    if (!file.path.endsWith(".tsx")) {
      return file;
    }
    const content = file.content.replace(
      /(href\s*(?:=|:)\s*)(["'])#([a-z0-9-]+)\2/gi,
      (match: string, prefix: string, quote: string, target: string) => {
        if (ids.has(target)) {
          return `${prefix}${quote}${homeAnchor(target)}${quote}`;
        }
        const suffixAlias = aliases.find(
          (suffix) =>
            target.endsWith(suffix) && ids.has(target.slice(0, -suffix.length)),
        );
        if (suffixAlias) {
          return `${prefix}${quote}${homeAnchor(target.slice(0, -suffixAlias.length))}${quote}`;
        }
        const targetTokens = new Set(
          target.split("-").filter((token) => token.length > 2),
        );
        const tokenAliases = [...ids].filter((id) =>
          id
            .split("-")
            .some((token) => token.length > 2 && targetTokens.has(token)),
        );
        return tokenAliases.length === 1
          ? `${prefix}${quote}${homeAnchor(tokenAliases[0])}${quote}`
          : match;
      },
    );
    return content === file.content ? file : { ...file, content };
  });
}

export function normalizeGeneratedInteractiveTargets(
  files: GeneratedProjectFile[],
): GeneratedProjectFile[] {
  return files.map((file) => {
    if (!file.path.endsWith(".tsx")) {
      return file;
    }
    return {
      ...file,
      content: normalizeGeneratedInteractiveContent(file.content),
    };
  });
}

export function normalizeGeneratedInteractiveContent(content: string): string {
  return ensureButtonTouchTargets(ensureActionTouchTargets(content));
}

function deduplicateJsxAttributes(content: string): string {
  return replaceJsxOpeningTags(
    content,
    ["a", "button", "Button", "div", "span", "p", "section", "article"],
    (tagSource, _tagName) => {
      const classMatches = [
        ...tagSource.matchAll(/\bclassName=(?:\{[\s\S]*?\}|"[^"]*"|'[^']*')/g),
      ];
      if (classMatches.length <= 1) {
        return tagSource;
      }
      const lastClassAttr = classMatches[classMatches.length - 1][0];
      const cleaned = tagSource.replace(
        /\bclassName=(?:\{[\s\S]*?\}|"[^"]*"|'[^']*')/g,
        "",
      );
      if (cleaned.endsWith("/>")) {
        return `${cleaned.slice(0, -2).trim()} ${lastClassAttr} />`;
      }
      if (cleaned.endsWith(">")) {
        return `${cleaned.slice(0, -1).trim()} ${lastClassAttr}>`;
      }
      return tagSource;
    },
  );
}

export function normalizeGeneratedSiteContent(content: string): string {
  const withoutRemoteFonts = content.replace(
    /@import\s+url\(\s*["']https:\/\/fonts\.googleapis\.com\/[^)]*["']\s*\)\s*;?/gi,
    "",
  );
  const normalizedSvgAttributes = withoutRemoteFonts.replace(
    /preserveAspectRatio=(["'])repeat(?:-[xy])?\1/gi,
    (_match: string, quote: string) =>
      `preserveAspectRatio=${quote}none${quote}`,
  );
  const normalizedComponentTokens = normalizeGeneratedComponentTokens(
    normalizedSvgAttributes,
  );
  return deduplicateJsxAttributes(
    normalizeGeneratedContrastSurfaces(
      normalizeGeneratedInteractiveContent(normalizedComponentTokens),
    ),
  );
}

function normalizeGeneratedComponentTokens(content: string): string {
  const normalized = replaceJsxOpeningTags(content, ["Badge"], (tagSource) => {
    if (!/\bvariant=["']secondary["']/.test(tagSource)) {
      return tagSource;
    }
    return tagSource.replace(
      /\btext-primary\b(?!-)/g,
      "text-secondary-foreground",
    );
  });
  return normalized.replace(/\btext-border\b(?!-)/g, "text-muted-foreground");
}

function normalizeGeneratedContrastSurfaces(content: string): string {
  // Normalize className="..." and string literals inside className={...}
  const literalPattern =
    /(?:className=["']([\s\S]*?)["']|className=\{[\s\S]*?\})/g;
  return content.replace(literalPattern, (match) => {
    return match.replace(
      /(["'`])([^"'`]+)\1/g,
      (innerMatch, quote, innerClasses) => {
        const normalized = normalizeGeneratedSurfaceClasses(innerClasses);
        return `${quote}${normalized}${quote}`;
      },
    );
  });
}

function normalizeGeneratedSurfaceClasses(classes: string): string {
  const hasOrangeSurface = /\bbg-(?:accent|terra)(?:\/\d{1,3})?\b/.test(
    classes,
  );
  const hasGreenSurface = /\bbg-\[#(?:25D366|1fb457)\]/i.test(classes);
  const hasWhiteSurface = /\bbg-white(?:\/\d{1,3})?\b/.test(classes);
  let normalized = classes;

  if (hasOrangeSurface) {
    normalized = normalized.replace(
      /\btext-(?:white|accent(?:-foreground)?|forest-foreground)(\/\d{1,3})?\b/g,
      (_match, opacity: string | undefined) =>
        `text-foreground${opacity ?? ""}`,
    );
    if (
      !/\btext-(?:foreground|background|primary-foreground)\b/.test(normalized)
    ) {
      normalized = `${normalized} text-foreground`;
    }
  }
  if (hasGreenSurface) {
    normalized = normalized.replace(
      /\btext-white(\/\d{1,3})?\b/g,
      (_match, opacity: string | undefined) =>
        `text-foreground${opacity ?? ""}`,
    );
  }
  if (hasWhiteSurface) {
    normalized = normalized.replace(
      /\btext-accent(?!-)(\/\d{1,3})?\b/g,
      (_match, opacity: string | undefined) =>
        `text-foreground${opacity ?? ""}`,
    );
  }
  return normalized;
}

export function normalizeBatchedSiteAnchors(
  files: GeneratedProjectFile[],
  options?: {
    photoEnabled?: boolean;
    primaryCtaTarget?: string;
    compositionPatternId?: string;
    palette?: {
      background: string;
      foreground: string;
      muted: string;
      accent: string;
    };
    ensurePrimaryCta?: boolean;
  },
): GeneratedProjectFile[] {
  const photoEnabled = options?.photoEnabled ?? true;
  const whatsappHref = toWhatsappHref(options?.primaryCtaTarget);
  return files.map((file) => {
    if (!file.path.endsWith(".tsx")) {
      return file;
    }
    let content = file.content.replaceAll(
      "@/lib/use-preview-ready",
      "@/lib/preview-ready",
    );
    if (!photoEnabled) {
      content = content.replaceAll(
        /<img[^>]*src="\/placeholder[^"]*"[^>]*\/?>/g,
        "",
      );
      content = content.replaceAll(/src="\/placeholder[^"]*"/g, "");
      // Remove self-closing empty framed placeholder boxes in image-free mode
      content = content.replace(
        /<(?:span|div)\b(?=[^>]*\baria-hidden=["']true["'])(?=[^>]*\bclassName=["'][^"']*(?:aspect-|\bh-\d|\bw-\d)[^"']*(?:\bbg-|\bborder-)[^"']*["'])[^>]*\/>/gi,
        "",
      );
    }
    if (whatsappHref) {
      content = content.replace(
        /<a([^>]*?)href=["']#[a-z0-9-]*["']([^>]*?)>([\s\S]{0,240}?(?:site\.primaryCta|whatsapp|chat|pesan)[\s\S]{0,240}?)<\/a>/gi,
        (_match, before: string, after: string, body: string) =>
          `<a${before}href="${whatsappHref}" target="_blank" rel="noopener noreferrer"${after}>${body}</a>`,
      );
      content = content.replace(
        /<span([^>]*?className=["'][^"']*(?:cta|primary)[^"']*["'][^>]*?)>([\s\S]{0,240}?site\.primaryCta[\s\S]{0,240}?)<\/span>/i,
        (_match, attributes: string, body: string) =>
          `<a${attributes} href="${whatsappHref}" target="_blank" rel="noopener noreferrer">${body}</a>`,
      );
    }
    const isGeneratedRouteSource =
      (file.path.startsWith("src/routes/") &&
        file.path !== "src/routes/__root.tsx" &&
        file.path !== "src/routes/not-found.tsx") ||
      file.path === "src/components/site/generated-shell.tsx";
    if (isGeneratedRouteSource) {
      content = normalizeStructuredArraySerializations(content);
      if (options?.palette) {
        content = normalizeAcceptedPaletteLiterals(content, options.palette);
      }
      // Any remaining raw hex literal in classes/inline styles gets mapped to semantic tokens
      content = content.replace(
        /\b(?:bg|text|border)-\[#[0-9a-f]{3,8}\]/gi,
        (match: string) => {
          if (match.startsWith("bg-")) {
            return "bg-accent";
          }
          if (match.startsWith("text-")) {
            return "text-foreground";
          }
          if (match.startsWith("border-")) {
            return "border-border";
          }
          return match;
        },
      );
      content = content.replace(/#[0-9a-f]{6}/gi, () => {
        return "currentColor";
      });
      content = content
        .replace(/\bh-screen\b/g, "min-h-dvh")
        .replace(/\bmin-min-h-dvh\b/g, "min-h-dvh")
        .replace(/\s+data-generated-site-starter(?:=["'][^"']*["'])?/gi, "")
        // Normalize uppercase tracking eyebrows if overused
        .replace(/\buppercase\s+tracking(?:-[\w[\].-]+)?\b/g, "font-medium")
        .replace(/\btracking(?:-[\w[\].-]+)?\s+uppercase\b/g, "font-medium")
        .replace(/font-medium\]/g, "font-medium")
        // Map generic raw tailwind color utilities onto semantic theme tokens
        .replace(
          /\b(?:bg|text|border)-(?:white|black|gray(?:-[\w/]+)?|slate(?:-[\w/]+)?|zinc(?:-[\w/]+)?|stone(?:-[\w/]+)?|neutral(?:-[\w/]+)?)\b/g,
          (match: string) => {
            if (match.startsWith("bg-")) {
              return "bg-muted";
            }
            if (match.startsWith("text-")) {
              return "text-foreground";
            }
            if (match.startsWith("border-")) {
              return "border-border";
            }
            return match;
          },
        )
        .replace(/\btext-muted\b(?!-)/g, "text-muted-foreground")
        .replace(/\btext-card\b(?!-)/g, "text-card-foreground")
        .replace(/\btext-popover\b(?!-)/g, "text-popover-foreground")
        .replace(/\btext-secondary\b(?!-)/g, "text-secondary-foreground")
        .replace(/\bborder-(?:l|r)-(?:2|3|4|5|6|8|\[[^\]]+\])\b/g, "")
        .replace(
          /\bborder\b([^"']*)\btext-background\b/g,
          "border$1text-foreground",
        )
        .replace(
          /<SiteCluster\b([^>]*)>/g,
          (_match: string, attributes: string) =>
            `<SiteCluster${attributes.replace(/\s+gap=["'][^"']*["']/i, "")}>`,
        )
        .replace(/\s+(?:left|right)=\{[^{}]*\}/gi, "")
        .replace(
          /<SiteSplit\b([^>]*)>/g,
          (_match: string, attributes: string) => {
            const normalized = attributes
              .replace(/\bemphasis=["']left["']/i, 'emphasis="leading"')
              .replace(/\bemphasis=["']right["']/i, 'emphasis="trailing"')
              .replace(/\s+(?:left|right)=(?:"[^"]*"|'[^']*'|\{[^}]*\})/gi, "");
            return `<SiteSplit${normalized}>`;
          },
        );
      // Ensure any text inside surface="contrast" never retains text-foreground
      content = content.replace(
        /<SiteSection\b(?=[^>]*\bsurface=["']contrast["'])[\s\S]*?<\/SiteSection>/gi,
        (sectionMatch: string) => {
          return sectionMatch.replace(
            /\btext-(?:foreground|muted-foreground|card-foreground|popover-foreground|secondary-foreground)\b(?!-)(\/\d{1,3})?/g,
            (_match, opacity) => `text-background${opacity ?? ""}`,
          );
        },
      );
      content = healContrastSurfaceText(content);
      content = healAccentSurfaceText(content);
      content = healDynamicContrastSurfaceText(content);
      content = healNestedLightSurfaceText(content);
    }
    if (file.path === "src/routes/index.tsx") {
      content = normalizeGeneratedHomeRouteContract(content);
      if (options?.compositionPatternId) {
        content = ensureCompositionPatternAnchor(
          content,
          options.compositionPatternId,
        );
      }
    }
    if (
      options?.ensurePrimaryCta &&
      isGeneratedRouteSource &&
      file.path.startsWith("src/routes/")
    ) {
      content = ensureGeneratedRoutePrimaryCta(
        content,
        whatsappHref,
        options?.primaryCtaTarget,
      );
    }
    content = normalizeGeneratedSiteContent(content);
    content = ensureCtaTouchTarget(content, whatsappHref);
    return { ...file, content };
  });
}

function normalizeAcceptedPaletteLiterals(
  content: string,
  palette: {
    background: string;
    foreground: string;
    muted: string;
    accent: string;
  },
): string {
  let normalized = content;
  for (const [role, value] of Object.entries(palette)) {
    const escaped = escapeHrefRegExp(value);
    normalized = normalized.replace(
      new RegExp(`\\b(bg|text|border)-\\[${escaped}\\]`, "gi"),
      (_match: string, utility: string) => `${utility}-${role}`,
    );
    normalized = normalized.replace(
      new RegExp(`\\b(fill|stroke)=["']${escaped}["']`, "gi"),
      (_match: string, attribute: string) => `${attribute}="currentColor"`,
    );
  }
  return normalized;
}

function normalizeGeneratedHomeRouteContract(content: string): string {
  let normalized = content;
  if (
    !/\bexport\s+(?:async\s+)?function\s+HomeRouteComponent\b/.test(normalized)
  ) {
    normalized = normalized.replace(
      /export\s+default\s+(async\s+)?function(?:\s+[A-Za-z_$][\w$]*)?\s*\(/,
      (_match: string, asyncKeyword: string | undefined) =>
        `export ${asyncKeyword ?? ""}function HomeRouteComponent(`,
    );
  }

  const hookValueVariables = new Set<string>();
  normalized = normalized.replace(
    /\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*usePreviewReady\s*\(\s*\)\s*;?/g,
    (_match: string, declaration: string, variable: string) => {
      hookValueVariables.add(variable);
      return `usePreviewReady(); ${declaration} ${variable} = true;`;
    },
  );
  for (const variable of hookValueVariables) {
    normalized = normalized.replace(
      new RegExp(
        `\\b${escapeHrefRegExp(variable)}\\s*\\?\\s*["']true["']\\s*:\\s*["']false["']`,
        "g",
      ),
      '"true"',
    );
  }

  return normalized;
}

function ensureCompositionPatternAnchor(
  content: string,
  compositionPatternId: string,
): string {
  const pattern = compositionPatternId.trim();
  if (!/^[a-z0-9-]+$/i.test(pattern)) {
    return content;
  }
  const existing = /data-pattern=["'][^"']*["']/i;
  if (existing.test(content)) {
    return content.replace(existing, `data-pattern="${pattern}"`);
  }
  return content.replace(
    /<(main|div|section)\b([^>]*)>/i,
    `<$1 data-pattern="${pattern}"$2>`,
  );
}

function toWhatsappHref(target: string | undefined): string | null {
  if (!target || target.startsWith("#")) {
    return null;
  }
  if (/^https:\/\/(?:wa\.me|api\.whatsapp\.com)\//i.test(target)) {
    return target;
  }
  const digits = target.replace(/\D/g, "");
  if (!digits) {
    return null;
  }
  const phone = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return `https://wa.me/${phone}?text=Halo`;
}

function containsAcceptedCtaTarget(source: string, target: string): boolean {
  const digits = target.replace(/\D/g, "");
  if (!digits) {
    return source.includes("site.primaryCta");
  }
  const canonical = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return (
    source.includes(digits) ||
    source.includes(canonical) ||
    source.includes(`wa.me/${digits}`) ||
    source.includes(`wa.me/${canonical}`)
  );
}

function ensureGeneratedRoutePrimaryCta(
  content: string,
  whatsappHref: string | null,
  rawTarget?: string,
): string {
  if (!whatsappHref) {
    return content;
  }
  // Check if content already contains the primary CTA target or WhatsApp link
  if (
    content.includes(whatsappHref) ||
    (rawTarget && containsAcceptedCtaTarget(content, rawTarget)) ||
    content.includes("site.primaryCta") ||
    /https:\/\/(?:wa\.me|api\.whatsapp\.com)/.test(content)
  ) {
    return content;
  }
  const action = `<div className="mt-10"><a href="${whatsappHref}" className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground">{site.primaryCta} via WhatsApp</a></div>`;
  const closingMain = content.lastIndexOf("</main>");
  if (closingMain < 0) {
    return `${content}\n${action}`;
  }
  return `${content.slice(0, closingMain)}${action}\n${content.slice(closingMain)}`;
}

function replaceJsxOpeningTags(
  content: string,
  tagNames: string[],
  replacer: (tagSource: string, tagName: string) => string,
): string {
  const nameSet = new Set(tagNames);
  let result = "";
  let i = 0;
  const len = content.length;

  while (i < len) {
    if (content[i] === "<") {
      const match = content.slice(i).match(/^<([a-zA-Z0-9_]+)\b/);
      if (match && nameSet.has(match[1] ?? "")) {
        const tagName = match[1] ?? "";
        let j = i + tagName.length + 1;
        let braceDepth = 0;
        let inQuote: '"' | "'" | "`" | null = null;
        let tagEnd = -1;

        while (j < len) {
          const char = content[j];
          if (inQuote) {
            if (char === "\\" && j + 1 < len) {
              j += 2;
              continue;
            }
            if (char === inQuote) {
              inQuote = null;
            }
          } else if (char === '"' || char === "'" || char === "`") {
            inQuote = char;
          } else if (char === "{") {
            braceDepth++;
          } else if (char === "}") {
            if (braceDepth > 0) {
              braceDepth--;
            }
          } else if (char === ">" && braceDepth === 0) {
            tagEnd = j + 1;
            break;
          }
          j++;
        }

        if (tagEnd !== -1) {
          const tagSource = content.slice(i, tagEnd);
          result += replacer(tagSource, tagName);
          i = tagEnd;
          continue;
        }
      }
    }
    result += content[i];
    i++;
  }

  return result;
}

function ensureActionTouchTargets(content: string): string {
  return replaceJsxOpeningTags(content, ["a"], (tagSource) => {
    if (!/\bhref\s*=\s*/.test(tagSource)) {
      return tagSource;
    }
    return makeTouchSafeAnchor(tagSource);
  });
}

function ensureButtonTouchTargets(content: string): string {
  return replaceJsxOpeningTags(content, ["Button", "button"], (tagSource) =>
    makeTouchSafeInteractiveElement(tagSource),
  );
}

function normalizeSmallTouchHeight(match: string): string {
  return match.replace(/\bmin-h-(?:6|7|8|9|10)\b/g, "min-h-11");
}

function makeTouchSafeAnchor(match: string): string {
  const normalized = normalizeSmallTouchHeight(match);
  if (/className=\{[\s\S]*?\}/s.test(normalized)) {
    return addTouchSafeStyle(normalized, "a");
  }
  const classNameMatch = normalized.match(/className=["']([\s\S]*?)["']/);
  if (classNameMatch) {
    const classes = classNameMatch[1] ?? "";
    const hasMinH = /\bmin-h-11\b/.test(classes);
    const hasMinW = /\bmin-w-11\b/.test(classes);
    const hasFlex = /\b(?:inline-flex|flex)\b/.test(classes);
    const hasFocusStyle =
      /\b(?:focus|focus-visible):(?:ring|outline-(?!none)|border)/.test(
        classes,
      );

    if (hasMinH && hasMinW && hasFlex && hasFocusStyle) {
      return normalized;
    }
    const needed = [
      !hasFlex && "inline-flex min-h-11 min-w-11 items-center justify-center",
      hasFlex && !hasMinH && "min-h-11",
      hasFlex && !hasMinW && "min-w-11",
      !hasFocusStyle &&
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    ]
      .filter(Boolean)
      .join(" ");

    const combined = `${needed} ${classes}`.trim().replace(/\s+/g, " ");
    return normalized.replace(
      /className=["']([\s\S]*?)["']/,
      `className="${combined}"`,
    );
  }
  return normalized.replace(
    "<a",
    '<a className="inline-flex min-h-11 min-w-11 items-center justify-center"',
  );
}

function makeTouchSafeInteractiveElement(match: string): string {
  const normalized = normalizeSmallTouchHeight(match);
  const tagName = normalized.startsWith("<Button") ? "Button" : "button";
  if (/className=\{[\s\S]*?\}/s.test(normalized)) {
    return addTouchSafeStyle(normalized, tagName);
  }
  const classNameMatch = normalized.match(/className=["']([\s\S]*?)["']/);
  if (classNameMatch) {
    const classes = classNameMatch[1] ?? "";
    const hasMinH = /\bmin-h-11\b/.test(classes);
    const hasMinW = /\bmin-w-11\b/.test(classes);
    if (hasMinH && hasMinW) {
      return normalized;
    }
    const needed = [!hasMinH && "min-h-11", !hasMinW && "min-w-11"]
      .filter(Boolean)
      .join(" ");

    const combined = `${needed} ${classes}`.trim().replace(/\s+/g, " ");
    return normalized.replace(
      /className=["']([\s\S]*?)["']/,
      `className="${combined}"`,
    );
  }
  return normalized.replace(
    `<${tagName}`,
    `<${tagName} className="min-h-11 min-w-11"`,
  );
}

function addTouchSafeStyle(match: string, tagName: string): string {
  const styleObjectPattern = /style=\{\{([\s\S]*?)\}\}/;
  if (styleObjectPattern.test(match)) {
    return match.replace(
      styleObjectPattern,
      (_styleMatch, properties: string) =>
        `style={{ minHeight: "44px", minWidth: "44px",${properties} }}`,
    );
  }
  const styleExpressionPattern = /style=\{([^{}]+)\}/;
  if (styleExpressionPattern.test(match)) {
    return match.replace(
      styleExpressionPattern,
      (_styleMatch, expression: string) =>
        `style={{ minHeight: "44px", minWidth: "44px", ...(${expression}) }}`,
    );
  }
  return match.replace(
    `<${tagName}`,
    `<${tagName} style={{ minHeight: "44px", minWidth: "44px" }}`,
  );
}

function ensureCtaTouchTarget(
  content: string,
  whatsappHref: string | null,
): string {
  const hrefPattern = whatsappHref
    ? `(?:${escapeHrefRegExp(whatsappHref)}|https://wa\\.me/[^"']+)`
    : "https://wa\\.me/[^\"']+";
  const anchorPattern = new RegExp(
    `<a([^>]*?)href=["']${hrefPattern}["']([^>]*?)>`,
    "gi",
  );
  return content.replace(anchorPattern, (match: string) =>
    makeTouchSafeAnchor(match),
  );
}

function escapeHrefRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
}

export type GeneratedSiteGateCategory =
  | "contract"
  | "content"
  | "cta"
  | "language"
  | "starter"
  | "media"
  | "claims"
  | "accessibility"
  | "genericness";

export type GeneratedSiteGateFinding = {
  category: GeneratedSiteGateCategory;
  severity: "critical" | "high" | "medium" | "low";
  code: string;
  message: string;
  path?: string;
  selector?: string;
};

export type GeneratedSiteSourceGateReportV1 = {
  version: 1;
  status: "pass" | "fail";
  findings: GeneratedSiteGateFinding[];
  riskSignals: GeneratedSiteGateFinding[];
};

const TECHNICAL_HEADING =
  /<(?:h[1-6]|[^>]+role=["']heading["'])[^>]*>\s*(?:HeroSection|PromoBanner|ProductCard|ProductGrid|TestimonialCard|SocialLinks)\s*</i;
const ENGLISH_HEADING =
  /<h[1-6][^>]*>\s*(?:Products|Testimonials|Connect With Us)\s*</i;
const PLACEHOLDER =
  /(?:\/placeholder(?:-vertical)?\.svg|replace this image|ganti foto)/i;
const EMPTY_GRAPHIC_FRAME =
  /<(?:span|div)\b(?=[^>]*\baria-hidden=["']true["'])(?=[^>]*\bclassName=["'][^"']*(?:aspect-|\bh-\d|\bw-\d)[^"']*(?:\bbg-|\bborder-)[^"']*["'])[^>]*\/>/i;
const SPEC_COPY_LEAK =
  /Katalog jadi hero utama|Fitur disederhanakan|Tujuan utama:\s*Katalog\/jualan|Info jelas|Online murni/i;
const GENERATED_FIELD_PATTERN =
  /site\.(headline|subheadline|primaryCta|offer|trustPoints|usp|sections|products|testimonials|faq|currentPromo|socialLinks)/;
const STARTER_MARKER =
  /Replace this with the real home page built from the brief|data-generated-site-starter/;

export function inspectGeneratedSiteSource(input: {
  contract: GeneratedSiteContractV1;
  designPlan: WriterDesignPlanV1 | null;
  files: GeneratedProjectFile[];
  starterIndexSource: string;
  themeChecks: ThemeContrastCheck[];
}): GeneratedSiteSourceGateReportV1 {
  const findings: GeneratedSiteGateFinding[] = [];
  const riskSignals: GeneratedSiteGateFinding[] = [];
  const normalizedPaths = new Map<string, string>();
  for (const file of input.files) {
    const normalized = file.path.toLocaleLowerCase("en-US");
    const prior = normalizedPaths.get(normalized);
    if (prior && prior !== file.path) {
      add(
        findings,
        "contract",
        "critical",
        "duplicate-case-insensitive-path",
        `Generated paths differ only by case: ${prior} and ${file.path}.`,
        file.path,
      );
    } else {
      normalizedPaths.set(normalized, file.path);
    }
  }
  const source = input.files
    .filter((file) => file.path.endsWith(".tsx"))
    .map((file) => file.content)
    .join("\n");
  const index = input.files.find(
    (file) => file.path === "src/routes/index.tsx",
  )?.content;

  if (
    !input.designPlan ||
    input.designPlan.contractHash !== input.contract.contractHash ||
    input.designPlan.recipeId !== input.contract.design.recipeId ||
    input.designPlan.mediaMode !== input.contract.design.mediaMode
  ) {
    if (!input.designPlan) {
      add(
        findings,
        "contract",
        "critical",
        "missing-design-plan",
        "Generated-site response omitted the required design plan.",
      );
    }
    add(
      findings,
      "contract",
      "critical",
      "design-plan-mismatch",
      "Writer design plan conflicts with the generated-site contract.",
    );
  }
  for (const section of input.contract.page.requiredSections) {
    if (
      input.designPlan &&
      !input.designPlan.sectionOrder.includes(section.id)
    ) {
      add(
        findings,
        "contract",
        "high",
        "missing-planned-section",
        `Design plan omits required section ${section.id}.`,
      );
    }
  }
  if (
    !index ||
    STARTER_MARKER.test(index) ||
    index.trim() === input.starterIndexSource.trim()
  ) {
    add(
      findings,
      "starter",
      "critical",
      "starter-residue",
      "Generated home route retains scaffold starter content.",
      "src/routes/index.tsx",
    );
  }
  if (ENGLISH_HEADING.test(source)) {
    add(
      findings,
      "language",
      "high",
      "customer-copy-english",
      "Generated Indonesian site contains English customer-facing section headings.",
    );
  }
  if (TECHNICAL_HEADING.test(source)) {
    add(
      findings,
      "content",
      "high",
      "technical-heading",
      "Implementation component name appears as a customer-facing heading.",
    );
  }
  if (SPEC_COPY_LEAK.test(source)) {
    add(
      findings,
      "content",
      "high",
      "spec-copy-leak",
      "Internal spec phrase leaked into customer copy (e.g. 'Katalog jadi hero utama' / 'Info jelas' / 'Online murni') — rewrite into benefit-driven Indonesian.",
    );
  }
  if (index && !GENERATED_FIELD_PATTERN.test(index)) {
    add(
      findings,
      "content",
      "critical",
      "contract-data-bypass",
      "Generated home route does not render accepted site.* fields; hardcoded local catalog data bypasses the contract.",
      "src/routes/index.tsx",
    );
  }
  if (/href=\{\s*\w+\.handle\s*\}/.test(source)) {
    add(
      findings,
      "cta",
      "critical",
      "social-handle-href",
      "Social handle is used as an href instead of its URL.",
    );
  }
  for (const anchor of source.matchAll(
    /(?:href=["']#|hash=["'])([a-z0-9-]+)["']/gi,
  )) {
    const id = anchor[1];
    if (!new RegExp(`id=["']${escapeRegExp(id)}["']`).test(source)) {
      add(
        findings,
        "cta",
        "critical",
        "missing-anchor-target",
        `Internal action targets #${id}, but no matching id exists.`,
      );
    }
  }
  const siteValue = parseSiteValue(input.files);
  if (siteValue) {
    for (const file of input.files.filter((candidate) =>
      candidate.path.endsWith(".tsx"),
    )) {
      for (const reference of invalidSiteReferences(file.content, siteValue)) {
        add(
          findings,
          "content",
          "critical",
          "unknown-site-field",
          `Generated source references ${reference}, which is absent from src/content/site.ts.`,
          file.path,
        );
      }
      for (const reference of structuredArraySerializationReferences(
        file.content,
        siteValue,
      )) {
        add(
          findings,
          "content",
          "high",
          "structured-array-serialization",
          `Generated source serializes structured site data through ${reference}; render its display field instead.`,
          file.path,
        );
      }
    }
  }
  const requiredFields = requiredContentFields(input.contract);
  for (const field of requiredFields) {
    if (!new RegExp(`\\bsite\\.${escapeRegExp(field)}\\b`).test(source)) {
      add(
        findings,
        "content",
        "high",
        "missing-required-content",
        `Required content site.${field} is not rendered.`,
      );
    }
  }
  if (
    input.contract.design.mediaMode !== "replaceable_slots" &&
    PLACEHOLDER.test(source)
  ) {
    add(
      findings,
      "media",
      "critical",
      "placeholder-forbidden",
      `Placeholders are forbidden in ${input.contract.design.mediaMode} media mode.`,
    );
  }
  for (const check of input.themeChecks) {
    if (!check.pass) {
      add(
        findings,
        "accessibility",
        "critical",
        "theme-contrast",
        `${check.role} contrast ${check.ratio.toFixed(2)} is below ${check.minimum}.`,
      );
    }
  }
  if (
    index &&
    /max-w-3xl/.test(index) &&
    input.contract.content.products.length > 0
  ) {
    riskSignals.push({
      category: "genericness",
      severity: "medium",
      code: "narrow-rich-page",
      message:
        "Rich catalog remains constrained to the starter-like narrow shell.",
      path: "src/routes/index.tsx",
    });
  }

  return {
    version: 1,
    status: findings.length ? "fail" : "pass",
    findings,
    riskSignals,
  };
}

export function referenceCalibratedRequiredContentFields(contract: {
  content: GeneratedSiteContractV1["content"];
}): string[] {
  const fields = ["headline", "subheadline", "primaryCta"];
  const content = contract.content;
  if (content.products.length) {
    fields.push("products");
  }
  if (content.trustPoints.length) {
    fields.push("trustPoints");
  }
  if (content.usp.length) {
    fields.push("usp");
  }
  if (content.promotion) {
    fields.push("currentPromo");
  }
  return fields;
}

export function requiredContentFields(contract: {
  content: GeneratedSiteContractV1["content"];
}): string[] {
  const fields = ["headline", "subheadline", "primaryCta"];
  const content = contract.content;
  if (content.products.length) {
    fields.push("products");
  }
  if (content.testimonials.length) {
    fields.push("testimonials");
  }
  if (content.faq.length) {
    fields.push("faq");
  }
  if (content.usp.length) {
    fields.push("usp");
  }
  if (content.hours.length) {
    fields.push("hours");
  }
  if (content.paymentMethods.length) {
    fields.push("paymentMethods");
  }
  if (content.address) {
    fields.push("address");
  }
  if (content.deliveryArea) {
    fields.push("deliveryArea");
  }
  if (content.socialLinks.length) {
    fields.push("socialLinks");
  }
  if (content.promotion) {
    fields.push("currentPromo");
  }
  return fields;
}

function add(
  findings: GeneratedSiteGateFinding[],
  category: GeneratedSiteGateCategory,
  severity: GeneratedSiteGateFinding["severity"],
  code: string,
  message: string,
  path?: string,
): void {
  findings.push({
    category,
    severity,
    code,
    message,
    ...(path ? { path } : {}),
  });
}

function parseSiteValue(
  files: GeneratedProjectFile[],
): Record<string, unknown> | null {
  const content = files.find(
    (file) => file.path === "src/content/site.ts",
  )?.content;
  const match = content?.match(
    /export const site =\s*([\s\S]+?)(?:\s+as const)?;/,
  );
  if (!match) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(match[1]);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

const ARRAY_METHODS = new Set([
  "map",
  "filter",
  "find",
  "findIndex",
  "forEach",
  "some",
  "every",
  "reduce",
  "reduceRight",
  "slice",
  "join",
  "includes",
  "indexOf",
  "at",
  "flatMap",
  "sort",
  "reverse",
  "entries",
  "keys",
  "values",
  "length",
  "toString",
  "isArray",
]);

export function inspectSiteFieldReferences(input: {
  content: string;
  site: Record<string, unknown>;
}): string[] {
  return invalidSiteReferences(input.content, input.site);
}

const STRING_METHODS = new Set([
  "toLowerCase",
  "toUpperCase",
  "trim",
  "slice",
  "startsWith",
  "endsWith",
  "includes",
  "replace",
  "replaceAll",
  "split",
  "charAt",
  "substring",
  "toString",
]);

function invalidSiteReferences(
  content: string,
  site: Record<string, unknown>,
): string[] {
  const source = ts.createSourceFile(
    "generated.tsx",
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const invalid = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      const chain = propertyChain(node);
      if (chain?.[0] === "site" && !pathExists(site, chain.slice(1))) {
        // Array or string method calls on matching data fields are legitimate.
        const method = chain[chain.length - 1];
        const parent = chain.slice(0, -1);
        const parentValue =
          parent.length > 1 ? valueAtPath(site, parent.slice(1)) : site;
        if (ARRAY_METHODS.has(method) && Array.isArray(parentValue)) {
          // legitimate array method — do not flag.
        } else if (
          STRING_METHODS.has(method) &&
          typeof parentValue === "string"
        ) {
          // legitimate string method — do not flag.
        } else {
          invalid.add(chain.join("."));
        }
      }
    }
    inspectMapCallback(node, site, invalid);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...invalid];
}

function structuredArraySerializationReferences(
  content: string,
  site: Record<string, unknown>,
): string[] {
  const source = ts.createSourceFile(
    "generated.tsx",
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const invalid = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      const chain = propertyChain(node);
      const method = chain?.[chain.length - 1];
      const parentValue =
        chain && chain.length > 2
          ? valueAtPath(site, chain.slice(1, -1))
          : undefined;
      if (
        chain?.[0] === "site" &&
        method === "join" &&
        isStructuredObjectArray(parentValue)
      ) {
        invalid.add(chain.join("."));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...invalid];
}

function isStructuredObjectArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.some(
      (item) =>
        typeof item === "object" && item !== null && !Array.isArray(item),
    )
  );
}

function inspectMapCallback(
  node: ts.Node,
  site: Record<string, unknown>,
  invalid: Set<string>,
): void {
  if (
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.name.text !== "map"
  ) {
    return;
  }
  const collection = propertyChain(node.expression.expression);
  const callback = node.arguments[0];
  if (
    collection?.[0] !== "site" ||
    !callback ||
    (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) ||
    !callback.parameters[0] ||
    !ts.isIdentifier(callback.parameters[0].name)
  ) {
    return;
  }
  const value = valueAtPath(site, collection.slice(1));
  const item = Array.isArray(value) ? value[0] : undefined;
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return;
  }
  const alias = callback.parameters[0].name.text;
  const visitAlias = (child: ts.Node): void => {
    if (ts.isPropertyAccessExpression(child)) {
      const chain = propertyChain(child);
      if (
        chain?.[0] === alias &&
        !pathExists(item as Record<string, unknown>, chain.slice(1))
      ) {
        invalid.add(chain.join("."));
      }
    }
    ts.forEachChild(child, visitAlias);
  };
  ts.forEachChild(callback.body, visitAlias);
}

function propertyChain(node: ts.Expression): string[] | null {
  if (ts.isIdentifier(node)) {
    return [node.text];
  }
  if (!ts.isPropertyAccessExpression(node)) {
    return null;
  }
  const parent = propertyChain(node.expression);
  return parent ? [...parent, node.name.text] : null;
}

function valueAtPath(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, value);
}

function pathExists(value: Record<string, unknown>, path: string[]): boolean {
  if (path.length === 0) {
    return true;
  }
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return false;
    }
    const record = current as Record<string, unknown>;
    if (!(key in record)) {
      return false;
    }
    current = record[key];
  }
  return true;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

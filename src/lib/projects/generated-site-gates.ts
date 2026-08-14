import ts from "typescript";

import type { WriterDesignPlanV1 } from "./batched-response";
import type {
  GeneratedSiteContractV1,
  GeneratedSiteWriterContractV2,
} from "./generated-site-contract";
import type { GeneratedSiteDesignKitV1 } from "./generated-site-design-kits/types";
import type { WriterDesignPlanV2 } from "./generated-site-design-plan";
import type { GeneratedProjectFile } from "./generated-types";
import type { ThemeContrastCheck } from "./scaffold/shadcn-theme";

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
  if (/[—–]/.test(input.source)) {
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
    /\btext-muted\b(?!-)/.test(input.source)
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
      source: index ?? source,
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
  const requiredFields = ["headline", "subheadline", "primaryCta"];
  const content = input.contract.content;
  if (content.products.length) {
    requiredFields.push("products");
  }
  if (content.trustPoints.length) {
    requiredFields.push("trustPoints");
  }
  if (content.usp.length) {
    requiredFields.push("usp");
  }
  if (content.promotion) {
    requiredFields.push("currentPromo");
  }
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

export function normalizeBatchedSiteAnchors(
  files: GeneratedProjectFile[],
  options?: {
    photoEnabled?: boolean;
    primaryCtaTarget?: string;
    compositionPatternId?: string;
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
    if (file.path === "src/routes/index.tsx") {
      content = content
        .replace(/\bh-screen\b/g, "min-h-dvh")
        .replace(/\btext-muted\b(?!-)/g, "text-muted-foreground")
        .replace(/\bborder-(?:l|r)-(?:2|3|4|5|6|8|\[[^\]]+\])\b/g, "")
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
      content = normalizeGeneratedHomeRouteContract(content);
      if (options?.compositionPatternId) {
        content = ensureCompositionPatternAnchor(
          content,
          options.compositionPatternId,
        );
      }
    }
    content = ensureCtaTouchTarget(content, whatsappHref);
    return { ...file, content };
  });
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
  return content.replace(anchorPattern, (match: string) => {
    if (/min-h-11/.test(match) && /inline-flex|flex/.test(match)) {
      return match;
    }
    if (/className=["'][^"']*["']/.test(match)) {
      return match.replace(
        /className=["']([^"']*)["']/,
        (_classMatch, classes: string) =>
          `className="inline-flex min-h-11 items-center justify-center ${classes}"`,
      );
    }
    return match.replace(
      "<a",
      '<a className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"',
    );
  });
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

function requiredContentFields(contract: GeneratedSiteContractV1): string[] {
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
        // Array method calls (site.<field>.map/filter/length/...) on an
        // array-valued field are legitimate; pathExists fails them because the
        // method name is not a data key. Skip when the parent chain resolves to
        // an array so genuine unknown data fields are still caught.
        const method = chain[chain.length - 1];
        const parent = chain.slice(0, -1);
        const parentValue =
          parent.length > 1 ? valueAtPath(site, parent.slice(1)) : site;
        if (ARRAY_METHODS.has(method) && Array.isArray(parentValue)) {
          // legitimate array method — do not flag.
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

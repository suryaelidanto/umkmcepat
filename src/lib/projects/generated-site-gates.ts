import ts from "typescript";

import type { WriterDesignPlanV1 } from "./batched-response";
import type { GeneratedSiteContractV1 } from "./generated-site-contract";
import type { GeneratedProjectFile } from "./generated-types";
import type { ThemeContrastCheck } from "./scaffold/shadcn-theme";

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
const STARTER_MARKER =
  /Replace this with the real home page built from the brief|data-generated-site-starter/;

export function inspectGeneratedSiteSource(input: {
  contract: GeneratedSiteContractV1;
  designPlan: WriterDesignPlanV1;
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
    input.designPlan.contractHash !== input.contract.contractHash ||
    input.designPlan.recipeId !== input.contract.design.recipeId ||
    input.designPlan.mediaMode !== input.contract.design.mediaMode
  ) {
    add(
      findings,
      "contract",
      "critical",
      "design-plan-mismatch",
      "Writer design plan conflicts with the generated-site contract.",
    );
  }
  for (const section of input.contract.page.requiredSections) {
    if (!input.designPlan.sectionOrder.includes(section.id)) {
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
  const match = content?.match(/export const site =\s*([\s\S]+?)\s+as const;/);
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
        invalid.add(chain.join("."));
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

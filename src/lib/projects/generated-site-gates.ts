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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

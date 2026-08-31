// src/lib/projects/build-planner.ts
import { groundProjectBriefToOwnerFacts, type ProjectBrief } from "./brief";
import {
  parseBuildContract,
  type BuildContractV1,
  type ContractAsset,
  type ContractFactV1,
} from "./build-contract";
import { createDraftHandoff } from "./build-handoffs";
import {
  hashBuildContract,
  hashBuildPlan,
  hashReviewItems,
} from "./build-hash";
import { parseBuildPlan } from "./build-plan";
import {
  createDiscussionContextSnapshot,
  parseCanonicalBrief,
} from "./canonical-brief";
import { hashCanonicalBrief } from "./canonical-brief-hash";
import { getRenderableFactEntry, normalizeFactLedger } from "./fact-ledger";
import { deriveReviewItems } from "./review-items";
import { parseVisitorJobs, type VisitorJob } from "./visitor-jobs";

import type { ContactValue } from "./brief-rich-fields";
import type { BuildPlanV1 } from "./build-plan";

export type PlannerDeps = {
  parseBuildContract: typeof parseBuildContract;
  hashContract: (contract: BuildContractV1) => string;
};

export type ContractDraftResult =
  { ok: true; value: BuildContractV1 } | { ok: false; reason: string };

function mapApprovedPurpose(
  purpose?: string,
): ContractAsset["approvedPurpose"] {
  switch (purpose) {
    case "logo":
      return "logo";
    case "reference":
      return "reference";
    case "hero":
      return "hero";
    case "product":
      return "product";
    case "gallery":
      return "gallery";
    default:
      return "hero";
  }
}

export function buildContractFromBrief(
  brief: ProjectBrief,
  deps: PlannerDeps,
  turnId = "server",
): ContractDraftResult {
  const identity = {
    businessName: isApprovedField(brief, "businessName")
      ? brief.businessName.trim()
      : "",
    businessType: isApprovedField(brief, "businessType")
      ? brief.businessType.trim() || null
      : null,
  };
  if (!identity.businessName) {
    return { ok: false, reason: "business name required" };
  }
  if (!brief.productOrService?.length || !isApprovedField(brief, "offers")) {
    return {
      ok: false,
      reason: "at least one owner-confirmed offer required",
    };
  }

  const explicitVisitorJobs = brief.visitorJobs ?? [];
  const parsedVisitorJobs = explicitVisitorJobs.length
    ? parseVisitorJobs(explicitVisitorJobs)
    : {
        ok: true as const,
        value: [
          {
            id: "primary-job",
            goal: "Memahami dan membeli/memakai layanan",
            priority: "primary" as const,
          },
        ],
      };
  if (!parsedVisitorJobs.ok) {
    return { ok: false, reason: parsedVisitorJobs.reason };
  }

  const facts: ContractFactV1[] = [];
  const provenance = () => ({
    source: "owner" as const,
    turnId: turnId ?? null,
    assetId: null,
    supersedesFactId: null,
    reviewItemId: null,
  });
  const addFact = <K extends ContractFactV1["kind"]>(
    fact: Extract<ContractFactV1, { kind: K }>,
  ) => facts.push(fact);

  if (brief.productOrService.length && isApprovedField(brief, "offers")) {
    addFact({
      id: "offer-primary",
      kind: "offer",
      value: brief.productOrService,
      provenance: provenance(),
    });
  }
  if (brief.contact && isApprovedField(brief, "contact")) {
    addFact({
      id: "contact-primary",
      kind: "contact",
      value: brief.contact,
      provenance: provenance(),
    });
  }
  if (brief.hours?.length && isApprovedField(brief, "hours")) {
    addFact({
      id: "hours-primary",
      kind: "hours",
      value: brief.hours,
      provenance: provenance(),
    });
  }
  if (brief.address && isApprovedField(brief, "address")) {
    addFact({
      id: "address-primary",
      kind: "address",
      value: { line1: brief.address },
      provenance: provenance(),
    });
  }
  if (brief.deliveryArea && isApprovedField(brief, "serviceArea")) {
    addFact({
      id: "service-area-primary",
      kind: "service_area",
      value: [{ area: brief.deliveryArea }],
      provenance: provenance(),
    });
  }
  if (brief.priceRange && isApprovedField(brief, "priceRange")) {
    addFact({
      id: "price-primary",
      kind: "price",
      value: [{ amount: brief.priceRange }],
      provenance: provenance(),
    });
  }
  if (brief.usp?.length && isApprovedField(brief, "usp")) {
    addFact({
      id: "usp-primary",
      kind: "usp",
      value: brief.usp,
      provenance: provenance(),
    });
  }
  if (brief.targetCustomer && isApprovedField(brief, "audience")) {
    addFact({
      id: "audience-primary",
      kind: "audience",
      value: brief.targetCustomer,
      provenance: provenance(),
    });
  }
  if (brief.tagline && isApprovedField(brief, "tagline")) {
    addFact({
      id: "tagline-primary",
      kind: "tagline",
      value: brief.tagline,
      provenance: provenance(),
    });
  }
  if (brief.since && isApprovedField(brief, "since")) {
    addFact({
      id: "since-primary",
      kind: "since",
      value: brief.since,
      provenance: provenance(),
    });
  }
  if (brief.testimonials?.length && isApprovedField(brief, "testimonials")) {
    addFact({
      id: "testimonials-primary",
      kind: "testimonial",
      value: brief.testimonials,
      provenance: provenance(),
    });
  }
  if (
    brief.certifications?.length &&
    isApprovedField(brief, "certifications")
  ) {
    addFact({
      id: "certifications-primary",
      kind: "certification",
      value: brief.certifications,
      provenance: provenance(),
    });
  }
  if (
    brief.paymentMethods?.length &&
    isApprovedField(brief, "paymentMethods")
  ) {
    addFact({
      id: "payment-primary",
      kind: "payment_method",
      value: brief.paymentMethods,
      provenance: provenance(),
    });
  }
  if (brief.socialLinks?.length && isApprovedField(brief, "socialLinks")) {
    addFact({
      id: "social-links-primary",
      kind: "social_link",
      value: brief.socialLinks,
      provenance: provenance(),
    });
  }
  if (brief.currentPromo && isApprovedField(brief, "promotion")) {
    addFact({
      id: "promotion-primary",
      kind: "promotion",
      value: [{ title: brief.currentPromo }],
      provenance: provenance(),
    });
  }
  if (brief.secondaryCta && isApprovedField(brief, "secondaryAction")) {
    addFact({
      id: "secondary-action-primary",
      kind: "secondary_action",
      value: brief.secondaryCta,
      provenance: provenance(),
    });
  }

  const ctaIntents = buildCtaIntents(brief);

  const draft: BuildContractV1 = {
    schemaVersion: 1,
    revision: 1,
    contentHash: "",
    identity,
    facts,
    decisions: (brief.decisions ?? []).map((d) => ({
      decisionId: d.id,
      state: "answered",
      sourceTurnId: "",
    })),
    visitorJobs: parsedVisitorJobs.value,
    ctaIntents,
    hardRequirements: [],
    prohibitedClaims: [],
    preferences: {
      visualDirection: isApprovedField(brief, "visualDirection")
        ? brief.stylePreference || null
        : null,
      tone: isApprovedField(brief, "tagline") ? brief.tagline || null : null,
      density: null,
      motion: null,
    },
    assets: (brief.businessImages ?? []).map((img) => ({
      assetId: img.id,
      approvedPurpose: mapApprovedPurpose(img.purpose),
    })),
    blockers: [],
    omissions: [],
  };

  const parsed = deps.parseBuildContract(draft);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason };
  }

  const contentHash = deps.hashContract(parsed.value);
  return {
    ok: true,
    value: { ...parsed.value, contentHash },
  };
}

function extractDiscussionOwnerTexts(messages: unknown[]): string[] {
  return messages.flatMap((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      return [];
    }
    const record = message as Record<string, unknown>;
    if (record.role !== "user" || !Array.isArray(record.parts)) {
      return [];
    }
    const text = record.parts
      .flatMap((part) => {
        if (!part || typeof part !== "object" || Array.isArray(part)) {
          return [];
        }
        const item = part as Record<string, unknown>;
        return item.type === "text" && typeof item.text === "string"
          ? [item.text]
          : [];
      })
      .join(" ")
      .trim();
    return text ? [text] : [];
  });
}

function isApprovedField(brief: ProjectBrief, field: string): boolean {
  const fieldStateKey =
    field === "offers"
      ? null
      : field === "audience"
        ? "targetCustomer"
        : field === "serviceArea"
          ? "deliveryArea"
          : field === "secondaryAction"
            ? "secondaryCta"
            : field === "visualDirection"
              ? null
              : field;
  const fieldState = fieldStateKey
    ? brief.fieldState?.[
        fieldStateKey as keyof NonNullable<ProjectBrief["fieldState"]>
      ]
    : undefined;
  if (fieldState === "declined" || fieldState === "explicitly_empty") {
    return false;
  }
  const ledger = normalizeFactLedger(brief.factLedger);
  if (ledger.entries.length === 0) {
    return true;
  }
  return Boolean(getRenderableFactEntry(ledger, field));
}

function buildCtaIntents(brief: ProjectBrief): BuildContractV1["ctaIntents"] {
  const contact = isApprovedField(brief, "contact")
    ? (brief.contact as ContactValue | null)
    : null;
  if (contact && contact.channel === "whatsapp") {
    return [
      {
        id: "cta-primary",
        kind: "whatsapp",
        label: "Chat",
        targetFactId: "contact-primary",
      },
    ];
  }
  if (contact && contact.channel === "phone") {
    return [
      {
        id: "cta-primary",
        kind: "phone",
        label: "Telepon",
        targetFactId: "contact-primary",
      },
    ];
  }
  if (brief.address && isApprovedField(brief, "address")) {
    return [
      {
        id: "cta-primary",
        kind: "visit",
        label: "Kunjungi",
        targetFactId: "address-primary",
      },
    ];
  }
  return [{ id: "cta-primary", kind: "browse", label: "Lihat" }];
}

export function buildPlanFromContract(contract: BuildContractV1): BuildPlanV1 {
  const factIds = contract.facts.map((f) => f.id);
  const parsedVisitorJobs = parseVisitorJobs(contract.visitorJobs);
  if (!parsedVisitorJobs.ok) {
    throw new Error(parsedVisitorJobs.reason);
  }
  const primaryJob = parsedVisitorJobs.value.find(
    (job) => job.priority === "primary",
  );
  if (!primaryJob) {
    throw new Error("visitor jobs require exactly one primary job");
  }
  const secondaryJobs = parsedVisitorJobs.value.filter(
    (job) => job.priority === "secondary",
  );
  const ctaFactIds = factIds.filter((id) =>
    contract.ctaIntents.some((cta) => cta.targetFactId === id),
  );
  const pages: BuildPlanV1["pages"] = [
    {
      id: "home",
      path: "/",
      title: contract.identity.businessName || "Beranda",
      purpose: "Landing and primary conversion",
      visitorJobIds: [primaryJob.id],
      requiredFactIds: ctaFactIds,
    },
  ];

  const usedPaths = new Set(pages.map((page) => page.path));
  for (const [index, job] of secondaryJobs.entries()) {
    const page = deriveSecondaryPage({
      factIds,
      job,
      usedPaths,
      index,
    });
    usedPaths.add(page.path);
    pages.push(page);
  }

  const capabilities = new Set<BuildPlanV1["capabilities"][number]>([
    "static_content",
  ]);
  if (contract.facts.some((fact) => fact.kind === "offer")) {
    capabilities.add("catalog");
  }
  if (contract.ctaIntents.some((cta) => cta.kind === "whatsapp")) {
    capabilities.add("whatsapp_cta");
  }
  if (
    contract.facts.some(
      (fact) =>
        fact.kind === "address" ||
        fact.kind === "service_area" ||
        fact.kind === "hours",
    )
  ) {
    capabilities.add("location");
  }

  const plan: BuildPlanV1 = {
    schemaVersion: 1,
    revision: 1,
    contractHash: contract.contentHash,
    contentHash: "",
    appKind: pages.length > 1 ? "marketing_site" : "landing",
    pages,
    navigation: pages.slice(1).map((p) => ({
      fromPageId: "home",
      toPageId: p.id,
      label: p.title,
    })),
    capabilities: [...capabilities],
  };
  return { ...plan, contentHash: hashBuildPlan(plan) };
}

function deriveSecondaryPage(input: {
  factIds: string[];
  index: number;
  job: VisitorJob;
  usedPaths: ReadonlySet<string>;
}): BuildPlanV1["pages"][number] {
  const text = `${input.job.id} ${input.job.goal}`.toLowerCase();
  if (/catalog|katalog|menu|produk|pilih|banding/.test(text)) {
    return createJobPage(input, {
      path: uniquePath("/katalog", input.usedPaths),
      title: "Katalog",
      purpose: "Browse offers",
      requiredFactIds: existingFactIds(input.factIds, ["offer-primary"]),
    });
  }
  if (/lokasi|alamat|datang|tempat|jam|area|local/.test(text)) {
    return createJobPage(input, {
      path: uniquePath("/lokasi", input.usedPaths),
      title: "Lokasi dan jam",
      purpose: "Find the business location and operating details",
      requiredFactIds: existingFactIds(input.factIds, [
        "address-primary",
        "hours-primary",
        "service-area-primary",
      ]),
    });
  }
  if (/pesan|order|beli|booking|hubung|tanya|konsult/.test(text)) {
    return createJobPage(input, {
      path: uniquePath("/pesan", input.usedPaths),
      title: "Cara pesan",
      purpose: "Understand how to contact and order",
      requiredFactIds: existingFactIds(input.factIds, [
        "offer-primary",
        "contact-primary",
      ]),
    });
  }

  const fallback = slugifyRouteSegment(input.job.id || input.job.goal);
  return createJobPage(input, {
    path: uniquePath(
      `/${fallback || `tujuan-${input.index + 1}`}`,
      input.usedPaths,
    ),
    title: input.job.goal,
    purpose: "Additional customer information",
    requiredFactIds: [],
  });
}

function createJobPage(
  input: {
    job: VisitorJob;
  },
  page: {
    path: string;
    purpose: string;
    requiredFactIds: string[];
    title: string;
  },
): BuildPlanV1["pages"][number] {
  return {
    id: input.job.id === "home" ? "visitor-home" : input.job.id,
    path: page.path,
    title: page.title,
    purpose: page.purpose,
    visitorJobIds: [input.job.id],
    requiredFactIds: page.requiredFactIds,
  };
}

function existingFactIds(allFactIds: string[], requested: string[]): string[] {
  const known = new Set(allFactIds);
  return requested.filter((id) => known.has(id));
}

function uniquePath(base: string, usedPaths: ReadonlySet<string>): string {
  if (!usedPaths.has(base)) {
    return base;
  }
  for (let suffix = 2; suffix <= 3; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!usedPaths.has(candidate)) {
      return candidate;
    }
  }
  throw new Error("visitor job route limit exceeded");
}

function slugifyRouteSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export type PrepareHandoffResult =
  | {
      state: "ready";
      handoffId: string;
      contract: BuildContractV1;
      plan: BuildPlanV1;
      reviewHash: string;
      reviewItems: ReturnType<typeof deriveReviewItems>;
    }
  | { state: "failed"; reason: string };

export async function prepareBuildHandoff(input: {
  projectId: string;
  userId: string;
  engine: string;
  brief: ProjectBrief;
  discussionContext?: {
    messages: unknown[];
    summary?: unknown;
    memoryFacts?: unknown;
  };
  turnId?: string;
}): Promise<PrepareHandoffResult> {
  const discussionOwnerTexts = input.discussionContext
    ? extractDiscussionOwnerTexts(input.discussionContext.messages)
    : [];
  const groundedBrief = discussionOwnerTexts.length
    ? groundProjectBriefToOwnerFacts(input.brief, {
        ownerTexts: discussionOwnerTexts,
        sourceTurnId: input.turnId,
      })
    : input.brief;
  const parsedBrief = parseCanonicalBrief(groundedBrief, groundedBrief.prompt);
  const briefSnapshot = input.discussionContext
    ? {
        ...parsedBrief,
        discussionContext: createDiscussionContextSnapshot(
          input.discussionContext,
        ),
      }
    : parsedBrief;
  const briefHash = hashCanonicalBrief(briefSnapshot);
  const contractResult = buildContractFromBrief(
    groundedBrief,
    { parseBuildContract, hashContract: hashBuildContract },
    input.turnId,
  );
  if (!contractResult.ok) {
    return { state: "failed", reason: contractResult.reason };
  }
  const contract = contractResult.value;

  const plan = buildPlanFromContract(contract);
  const planParsed = parseBuildPlan(plan);
  if (!planParsed.ok) {
    return { state: "failed", reason: planParsed.reason };
  }
  const validatedPlan = planParsed.value;

  const reviewItems = deriveReviewItems(contract, validatedPlan);
  const reviewHashValue = hashReviewItems(reviewItems);
  const created = await createDraftHandoff({
    projectId: input.projectId,
    userId: input.userId,
    engine: input.engine,
    briefSnapshot,
    briefHash,
    briefRevision: 2,
    contract,
    plan: validatedPlan,
    contractHash: contract.contentHash,
    planHash: hashBuildPlan(validatedPlan),
    reviewItems,
    reviewHash: reviewHashValue,
    contractRevision: contract.revision,
    planRevision: validatedPlan.revision,
  });

  return {
    state: "ready",
    handoffId: created.id,
    contract,
    plan: validatedPlan,
    reviewHash: created.reviewHash,
    reviewItems: created.reviewItems as ReturnType<typeof deriveReviewItems>,
  };
}

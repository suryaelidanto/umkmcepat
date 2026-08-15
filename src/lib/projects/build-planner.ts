// src/lib/projects/build-planner.ts
// Pre-build planning: turn a review-ready brief into a validated, hashed
// BuildContractV1 draft. Planning runs before the build-recommendation card
// for contract-v1 projects. The model proposes; the server validates.
import {
  parseBuildContract,
  type BuildContractV1,
  type ContractFactV1,
} from "./build-contract";
import { generateBuildCreativeDirection } from "./build-creative-direction";
import { createDraftHandoff } from "./build-handoffs";
import {
  hashBuildContract,
  hashBuildPlan,
  hashReviewItems,
} from "./build-hash";
import { parseBuildPlan } from "./build-plan";
import { hashCanonicalBrief, parseCanonicalBrief } from "./canonical-brief";
import { deriveReviewItems } from "./review-items";

import type { ProjectBrief } from "./brief";
import type { ContactValue } from "./brief-rich-fields";
import type { BuildPlanV1 } from "./build-plan";
import type { UIMessage } from "ai";

export type PlannerDeps = {
  parseBuildContract: typeof parseBuildContract;
  hashContract: (contract: BuildContractV1) => string;
};

export type ContractDraftResult =
  { ok: true; value: BuildContractV1 } | { ok: false; reason: string };

/** Map a rich, review-ready brief into a contract-v1 draft. Server-owned
 * normalization; the AI never writes facts directly. */
export function buildContractFromBrief(
  brief: ProjectBrief,
  deps: PlannerDeps,
  turnId = "server",
): ContractDraftResult {
  const identity = {
    businessName: brief.businessName.trim(),
    businessType: brief.businessType.trim() || null,
  };
  if (!identity.businessName) {
    return { ok: false, reason: "business name required" };
  }
  if (!brief.productOrService?.length) {
    return { ok: false, reason: "at least one offer required" };
  }

  const facts: ContractFactV1[] = [];

  if (brief.productOrService.length) {
    facts.push({
      id: "offer-primary",
      kind: "offer",
      value: brief.productOrService,
      provenance: {
        source: "owner",
        turnId: turnId ?? null,
        assetId: null,
        supersedesFactId: null,
        reviewItemId: null,
      },
    });
  }

  if (brief.contact) {
    facts.push({
      id: "contact-primary",
      kind: "contact",
      value: brief.contact,
      provenance: {
        source: "owner",
        turnId: turnId ?? null,
        assetId: null,
        supersedesFactId: null,
        reviewItemId: null,
      },
    });
  }

  if (brief.hours?.length) {
    facts.push({
      id: "hours-primary",
      kind: "hours",
      value: brief.hours,
      provenance: {
        source: "owner",
        turnId: turnId ?? null,
        assetId: null,
        supersedesFactId: null,
        reviewItemId: null,
      },
    });
  }

  if (brief.address) {
    facts.push({
      id: "address-primary",
      kind: "address",
      value: { line1: brief.address },
      provenance: {
        source: "owner",
        turnId: turnId ?? null,
        assetId: null,
        supersedesFactId: null,
        reviewItemId: null,
      },
    });
  }

  if (brief.paymentMethods?.length) {
    facts.push({
      id: "payment-primary",
      kind: "payment_method",
      value: brief.paymentMethods,
      provenance: {
        source: "owner",
        turnId: turnId ?? null,
        assetId: null,
        supersedesFactId: null,
        reviewItemId: null,
      },
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
    visitorJobs: [
      {
        id: "primary-job",
        goal: "Memahami dan membeli/memakai layanan",
        priority: "primary",
      },
    ],
    ctaIntents,
    hardRequirements: [],
    prohibitedClaims: [],
    preferences: {
      visualDirection: brief.stylePreference || null,
      tone: brief.tagline || null,
      density: null,
      motion: null,
    },
    assets: [],
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

function buildCtaIntents(brief: ProjectBrief): BuildContractV1["ctaIntents"] {
  const contact = brief.contact as ContactValue | null;
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
  if (brief.address) {
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

/** Deterministic single-page plan derived from the contract. contract-v1
 * starts with a safe landing topology; the page-plan model call (deferred)
 * can expand pages later. The platform still owns topology correctness. */
export function buildPlanFromContract(contract: BuildContractV1): BuildPlanV1 {
  const factIds = contract.facts.map((f) => f.id);
  const hasCatalog = contract.visitorJobs.some((j) =>
    /catalog|katalog|menu|list/i.test(j.goal),
  );
  const pages: BuildPlanV1["pages"] = [
    {
      id: "home",
      path: "/",
      title: contract.identity.businessName || "Beranda",
      purpose: "Landing and primary conversion",
      visitorJobIds: contract.visitorJobs.map((j) => j.id),
      requiredFactIds: factIds.filter((id) =>
        contract.ctaIntents.some((c) => c.targetFactId === id),
      ),
      sections: [
        {
          id: "hero",
          purpose: "Intro and primary CTA",
          surfaceIntent: "full_bleed",
          requiredFactIds: [],
          requiredAssetIds: [],
        },
      ],
    },
  ];

  if (hasCatalog && contract.visitorJobs.length) {
    pages.push({
      id: "katalog",
      path: "/katalog",
      title: "Katalog",
      purpose: "Browse offers",
      visitorJobIds: [],
      requiredFactIds: [],
      sections: [
        {
          id: "catalog",
          purpose: "Offer listing",
          surfaceIntent: "contained",
          requiredFactIds: [],
          requiredAssetIds: [],
        },
      ],
    });
  }

  const plan: BuildPlanV1 = {
    schemaVersion: 1,
    revision: 1,
    contractHash: contract.contentHash,
    contentHash: "",
    appKind: hasCatalog ? "marketing_site" : "landing",
    archetype: contract.identity.businessType || "generic",
    pages,
    navigation: pages.slice(1).map((p) => ({
      fromPageId: "home",
      toPageId: p.id,
      label: p.title,
    })),
    capabilities: ["static_content", "whatsapp_cta"],
    artDirection: {
      businessSpecificReference: contract.identity.businessName,
      antiReferences: [],
      imageStrategy: "typographic",
      fontStrategy: "system_stack",
    },
  };
  return { ...plan, contentHash: hashBuildPlan(plan) };
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

/**
 * Build an immutable draft handoff from a review-ready brief. Combines
 * contract + plan + review items, hashes them, and persists (or reuses) the
 * handoff row. Engine-guarded: only called for contract-v1 projects.
 */
export async function prepareBuildHandoff(input: {
  projectId: string;
  userId: string;
  engine: string;
  brief: ProjectBrief;
  turnId?: string;
  messages?: UIMessage[];
}): Promise<PrepareHandoffResult> {
  const briefSnapshot = parseCanonicalBrief(input.brief, input.brief.prompt);
  const briefHash = hashCanonicalBrief(briefSnapshot);
  const contractResult = buildContractFromBrief(
    input.brief,
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
  // Written once from the discussion and frozen with the rest of the handoff,
  // so a retry executes the same direction instead of re-imagining it.
  const creative = input.messages?.length
    ? await generateBuildCreativeDirection({
        businessName: briefSnapshot.business.name,
        businessType: briefSnapshot.business.type,
        messages: input.messages,
        projectId: input.projectId,
        userId: input.userId,
        turnId: input.turnId,
      })
    : null;
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
    creativeDirection: creative?.direction ?? null,
    creativeDirectionHash: creative?.hash ?? null,
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

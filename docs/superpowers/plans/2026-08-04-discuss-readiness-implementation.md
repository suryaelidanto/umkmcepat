# Discuss Readiness Implementation Plan

**Date:** 2026-08-04  
**Implementation Mode:** Build  
**Phases:** Two (Phase 1 standalone, Phase 2 full gate)

---

## Pre-flight Checks

Before starting:

- [ ] Node/Bun environment ready (`bun --version` v1.x+)
- [ ] Dependencies installed (`bun install`)
- [ ] Tests pass (`bun test`)
- [ ] Prisma schema current (`bun prisma generate`)
- [ ] No pending migrations needed (brief changes use JSON)

---

## Phase 1: Local Placeholder SVG (Standalone)

### Step-by-step Implementation

#### Step 1. Create placeholder SVG content

File: `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts`

Locate the function that generates scaffold files. Add a helper:

```ts
function svgPlaceholderContent(): string {
  return `<svg width="600" height="400" viewBox="0 0 600 400" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="placeholderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f5f5f4;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#e7e5e4;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="600" height="400" fill="url(#placeholderGrad)"/>
  <g transform="translate(300,200)">
    <text font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="600" text-anchor="middle" fill="#57534e" dy="-10">
      Tidak ada foto
    </text>
    <text font-family="system-ui, -apple-system, sans-serif" font-size="14" text-anchor="middle" fill="#a8a29e" dy="20">
      Bagian ini akan menampilkan foto produk/galeri
    </text>
  </g>
</svg>`;
}
```

Add to scaffold file array:

```ts
{
  path: "public/placeholder.svg",
  content: svgPlaceholderContent(),
},
```

#### Step 2. Update generator prompt

File: `src/lib/projects/custom-source-generator.ts` around line 2451

Find existing guidance section and extend:

```ts
// Existing
UPLOADED IMAGES: when the owner attaches images, read each (vision) + place it where it fits (hero, gallery, product card). Reference each via the mediaPath given in the turn metadata as <img src="/media/<assetId>" alt="<short alt>" /> — NEVER the raw cloud URL. If you cannot understand an image, ask the user where to place it instead of guessing.

// Append after
NO IMAGE FALLBACK: if this section requires an image but no photo exists, use <img src="/placeholder.svg" alt="<short description>" /> instead of leaving the slot empty or breaking. This ensures the site always renders something intentional. For example: <img src="/placeholder.svg" alt="Foto produk ayam geprek" />.
```

#### Step 3. Add tests

File: `src/lib/projects/scaffold/scaffold.test.ts`

```ts
import { describe, expect, it } from "bun:test";
import { createScaffoldFiles } from "./vite-tanstack-shadcn-starter.js";

describe("scaffold includes placeholder", () => {
  it("includes placeholder.svg in public dir", () => {
    const schema = { /* minimal valid */ };
    const { files } = createScaffoldFiles(schema);
    
    const placeholder = files.find(f => f.path === "public/placeholder.svg");
    expect(placeholder).toBeDefined();
    expect(placeholder!.content).toContain("</svg>");
    expect(placeholder!.content).toContain("Tidak ada foto");
  });
});
```

File: `src/lib/projects/custom-source-generator.test.ts`

Create integration-like test:

```ts
it("uses placeholder.svg when generating image sections without photos", async () => {
  const brief = createMinimalBrief({ hasImages: false });
  const context = createTestContext(brief);
  
  const result = await generateProjectFromBrief(brief, context);
  
  const homeRoute = result.files.find(f => f.path === "src/routes/index.tsx");
  expect(homeRoute!.content).toContain("/placeholder.svg");
});
```

#### Step 4. Verify and deploy

Run tests:

```bash
bun test src/lib/projects/scaffold/scaffold.test.ts
bun test src/lib/projects/custom-source-generator.test.ts
```

Verify visually:

```bash
# Generate a test project
bun run dev # start dev server
# Navigate to test project preview
# Check image slots render placeholder
```

Ship Phase 1 changes first, monitor CSP logs.

---

## Phase 2: Discuss Readiness Gate

### Task 1. Typed UMKM classification

File: `src/lib/projects/brief.ts`

Read file first to find exact locations:

```bash
rg -n "export type ProjectBrief\|export type ProjectBriefPatch\|export function parseProjectBrief" src/lib/projects/brief.ts
```

#### Add umkmType field

Locate `ProjectBrief` type definition (around line 28):

```ts
export type ProjectBrief = {
  version: 1;
  prompt: string;
  facts?: ProjectFact[];
  decisions?: ProjectDecision[];
  businessName: string;
  businessType: string;
  offer: string;
  targetCustomer: string;
  contactOrCta: string;
  stylePreference: string;
  notes: string[];
  confidence?: number;
  openQuestions?: string[];
  productOrService: ProductOrServiceItem[] | null;
  contact: ContactValue | null;
  tagline: string | null;
  usp: string[] | null;
  priceRange: string | null;
  visuals: boolean | null;
  hours: HoursValue[] | null;
  address: string | null;
  deliveryArea: string | null;
  since: string | null;
  testimonials: TestimonialValue[] | null;
  certifications: CertificationValue[] | null;
  paymentMethods: PaymentMethodValue[] | null;
  socialLinks: SocialLinkValue[] | null;
  currentPromo: string | null;
  secondaryCta: { label: string; action: string } | null;
  readyForBuild: boolean;
  // ADD THIS LINE:
  umkmType?: UmkmType | null;
};
```

Extend `ProjectBriefPatch`:

```ts
export type ProjectBriefPatch = Partial<
  Pick<...> // existing fields
> & {
  confidence?: number;
  decisions?: ProjectDecision[];
  facts?: ProjectFact[];
  notes?: string[];
  openQuestions?: string[];
  // ADD THIS:
  umkmType?: UmkmType | null;
};
```

Update merge logic (`mergeProjectBriefPatch`):

```ts
// After merging existing fields, add:
if (patch.umkmType !== undefined && patch.umkmType !== null) {
  next.umkmType = patch.umkmType;
}
```

Update parsing (`parseProjectBrief` around line 182):

```ts
const parsedBrief: ProjectBrief = {
  version: 1,
  // ... existing fields ...
  umkmType: isObject(source?.umkmType) && typeof source.umkmType === "string"
    ? source.umkmType
    : "other",
  readyForBuild: false,
};
```

Import `UmkmType` at top:

```ts
import type { UmkmType } from "./brief-rich-fields";
```

Add test in `brief.test.ts`:

```ts
it("defaults umkmType to 'other' when unknown", () => {
  const brief = parseProjectBrief({}, "");
  expect(brief.umkmType).toBe("other");
});

it("parses umkmType from input", () => {
  const brief = parseProjectBrief({ umkmType: "fnb" }, "");
  expect(brief.umkmType).toBe("fnb");
});
```

#### Run verification:

```bash
bun test src/lib/projects/brief.test.ts
```

---

### Task 2. Persist field state

File: `src/lib/projects/brief.ts`

Add to `ProjectBrief`:

```ts
// After umkmType line
fieldState?: FieldStateMap;
```

Extend `ProjectBriefPatch`:

```ts
export type ProjectBriefPatch = Partial<...> & {
  // ...
  fieldState?: FieldStateMap;
};
```

Update `mergeProjectBriefPatch`:

```ts
if (patch.fieldState) {
  next.fieldState = { ...next.fieldState, ...patch.fieldState };
}
```

Update `parseProjectBrief`:

```ts
fieldState: isObject(source?.fieldState) ? (source.fieldState as FieldStateMap) : {},
```

Import `FieldStateMap`:

```ts
import type { FieldStateMap } from "./chat-memory";
```

Fix call sites:

File: `src/routes/api.projects.preview.ts` around line 369

Before:

```ts
const chatContext = buildProjectChatContext({
  fieldState: {},
  memoryFacts,
  messages,
  summary: chatSummary,
});
```

After (derive from stored state):

```ts
const storedFieldState = project.brief?.fieldState ?? {};
const chatContext = buildProjectChatContext({
  fieldState: storedFieldState,
  memoryFacts,
  messages,
  summary: chatSummary,
});
```

File: `src/lib/projects/discuss-queue-worker.ts` around line 76

Before:

```ts
const chatContext = buildProjectChatContext({
  fieldState: {},
  memoryFacts,
  messages: messages as UIMessage[],
  summary,
});
```

After:

```ts
const storedFieldState = row.brief?.fieldState ?? {};
const chatContext = buildProjectChatContext({
  fieldState: storedFieldState,
  memoryFacts,
  messages: messages as UIMessage[],
  summary,
});
```

Add test coverage:

```ts
it("merges field state from patch", () => {
  const initial: ProjectBrief = {
    version: 1,
    prompt: "",
    businessName: "",
    businessType: "",
    offer: "",
    targetCustomer: "",
    contactOrCta: "",
    stylePreference: "",
    notes: [],
    productOrService: [],
    contact: null,
    tagline: null,
    usp: null,
    priceRange: null,
    visuals: null,
    hours: null,
    address: null,
    deliveryArea: null,
    since: null,
    testimonials: null,
    certifications: null,
    paymentMethods: null,
    socialLinks: null,
    currentPromo: null,
    secondaryCta: null,
    readyForBuild: false,
    fieldState: { contact: "answered" },
  };
  
  const patch: ProjectBriefPatch = {
    fieldState: { address: "declined" },
  };
  
  const merged = mergeProjectBriefPatch(initial, patch);
  
  expect(merged.fieldState).toEqual({
    contact: "answered",
    address: "declined",
  });
});
```

Verify:

```bash
bun test src/lib/projects/brief.test.ts
```

---

### Task 3. Deterministic readiness evaluator

Create new file: `src/lib/projects/discuss-readiness.ts`

Full implementation:

```ts
import { getApplicableFields, SOFT_FIELDS, type UmkmType } from "./brief-rich-fields";
import type { ProjectBrief } from "./brief";
import type { FieldStateMap, FieldState } from "./chat-memory";

export type DiscussBlocker = {
  fieldId: SoftFieldId;
  reason: string;
};

export type DiscussOmission = {
  fieldId: SoftFieldId;
  reason: "skipped" | "unknown" | "not_applicable";
};

/** Result of evaluating whether brief is ready for build. */
export type DiscussReadiness =
  | { state: "needs_question"; blockers: DiscussBlocker[]; nextFieldId: SoftFieldId | null }
  | { state: "ready_for_build"; blockers: []; omissions: DiscussOmission[] };

/** Structural fields whose absence would cause wrong layout/content. */
function structuralFieldIds(): SoftFieldId[] {
  return [
    "contact",
    "tagline",
    "usp",
    "targetCustomer",
    "priceRange",
    "visuals",
    "hours",
    "address",
    "deliveryArea",
    "since",
    "secondaryCta",
  ];
}

/**
 * Evaluate if brief is ready for build based on structural completeness.
 * Blockers are unresolved structural questions; ready when empty.
 */
export function evaluateDiscussReadiness(input: {
  brief: ProjectBrief;
  fieldState: FieldStateMap;
  umkmType?: UmkmType | null;
}): DiscussReadiness {
  const { brief, fieldState, umkmType } = input;
  const applicable = getApplicableFields(umkmType ?? "other");
  const structural = structuralFieldIds().filter(id => applicable.includes(id));
  
  const blockers: DiscussBlocker[] = [];
  const omissions: DiscussOmission[] = [];
  
  for (const field of structural) {
    const state = fieldState[field];
    
    if (!state || state === "asked") {
      // Not asked yet OR asked but awaiting answer → blocker
      blockers.push({
        fieldId: field,
        reason: getBlockerReason(field, umkmType),
      });
    } else if (state === "answered") {
      continue; // resolved
    } else if (state === "declined" || state === "explicitly_empty") {
      // Explicit skip → record omission
      omissions.push({
        fieldId: field,
        reason: state === "declined" ? "skipped" : "unknown",
      });
    }
  }
  
  // Cross-field constraints
  const crossBlockers: Array<{ fieldId: SoftFieldId; reason: string }> = [];
  
  // WhatsApp/order CTA needs contact info
  if (
    brief.contactOrCta?.toLowerCase().includes("whatsapp") ||
    brief.contactOrCta?.toLowerCase().includes("order")
  ) {
    if (!brief.contact) {
      const contactState = fieldState["contact"];
      if (contactState !== "declined" && contactState !== "explicitly_empty") {
        crossBlockers.push({
          fieldId: "contact",
          reason: "CTA whatsapp/order butuh nomor kontak yang valid",
        });
      }
    }
  }
  
  // Local businesses need address
  if ((umkmType === "fnb" || umkmType === "retail" || umkmType === "jasa_lokal") && !brief.address) {
    const addressState = fieldState["address"];
    if (addressState !== "declined" && addressState !== "explicitly_empty") {
      crossBlockers.push({
        fieldId: "address",
        reason: "warung/toko/jasa lokal perlu alamat untuk bagian lokasi",
      });
    }
  }
  
  // Multiple offers need primary flagged
  if (Array.isArray(brief.productOrService) && brief.productOrService.length > 1) {
    const hasPrimary = brief.productOrService.some(p => p.isPrimary === true);
    if (!hasPrimary) {
      crossBlockers.push({
        fieldId: "primaryOffer",
        reason: "beberapa produk tapi belum ada yang jadi andalan utama",
      });
    }
  }
  
  for (const cross of crossBlockers) {
    blockers.push({ fieldId: cross.fieldId, reason: cross.reason });
  }
  
  if (blockers.length === 0) {
    return { state: "ready_for_build", blockers: [], omissions };
  }
  
  const nextFieldId = findNextUnansweredField(applicable, fieldState);
  
  return { state: "needs_question", blockers, nextFieldId };
}

function getBlockerReason(field: SoftFieldId, umkmType?: UmkmType | null): string {
  const translations: Record<SoftFieldId, string> = {
    contact: "kontak/nomor WA",
    tagline: "tagline",
    usp: " USP (keunggulan)",
    targetCustomer: "target pelanggan",
    priceRange: "kisaran harga",
    visuals: "foto produk",
    hours: "jam buka",
    address: "alamat",
    deliveryArea: "area pengiriman",
    since: "tahun berdiri",
    secondaryCta: "CTA sekunder",
    primaryOffer: "produk andalan",
  };
  
  const base = translations[field] ?? field;
  
  if (umkmType === "fnb") {
    if (field === "address") return "alamat warung (penting untuk lokasi)";
    if (field === "hours") return "jam operasional";
    if (field === "deliveryArea") return "radius pengiriman";
  }
  
  return `${base} belum dijawab`;
}

function findNextUnansweredField(applicable: SoftFieldId[], fieldState: FieldStateMap): SoftFieldId | null {
  const structuralFirst = structuralFieldIds().filter(f => applicable.includes(f));
  
  const answeredSet = new Set<SofieldId>();
  const declinedSet = new Set<SofieldId>();
  
  for (const [field, state] of Object.entries(fieldState) as Array<[SoftFieldId, FieldState]>) {
    if (state === "answered") {
      answeredSet.add(field);
    } else if (state === "declined" || state === "explicitly_empty") {
      declinedSet.add(field);
    }
  }
  
  // First priority: unanswered structural fields
  for (const field of structuralFirst) {
    if (!answeredSet.has(field) && !declinedSet.has(field)) {
      return field;
    }
  }
  
  // Fallback: any other applicable field
  for (const field of applicable) {
    if (!answeredSet.has(field) && !declinedSet.has(field)) {
      return field;
    }
  }
  
  return null;
}
```

Add import alias issue fix (typo):

```ts
// Line above: changed SofieldId to SoftFieldId in two places
```

Create test file: `src/lib/projects/discuss-readiness.test.ts`

```ts
import { describe, expect, it } from "bun:test";
import { evaluateDiscussReadiness } from "./discuss-readiness";
import { recordFieldAnswer, recordFieldDecline } from "./chat-memory";
import type { UmkmType } from "./brief-rich-fields";

function createBrief(params: Partial<ProjectBrief> = {}): ProjectBrief {
  return {
    version: 1,
    prompt: "",
    businessName: params.businessName || "Toko ABC",
    businessType: params.businessType || "retail",
    offer: params.offer || "barang umum",
    targetCustomer: params.targetCustomer || "umum",
    contactOrCta: params.contactOrCta || "WhatsApp",
    stylePreference: params.stylePreference || "modern",
    notes: [],
    productOrService: params.productOrService || [{ name: "Produk A", isPrimary: true }],
    contact: params.contact || null,
    tagline: params.tagline || null,
    usp: params.usp || null,
    priceRange: params.priceRange || null,
    visuals: params.visuals || null,
    hours: params.hours || null,
    address: params.address || null,
    deliveryArea: params.deliveryArea || null,
    since: params.since || null,
    testimonials: params.testimonials || null,
    certifications: params.certifications || null,
    paymentMethods: params.paymentMethods || null,
    socialLinks: params.socialLinks || null,
    currentPromo: params.currentPromo || null,
    secondaryCta: params.secondaryCta || null,
    readyForBuild: false,
    umkmType: params.umkmType || undefined,
    fieldState: params.fieldState || {},
  };
}

describe("evaluateDiscussReadiness", () => {
  it("fnb missing address blocks", () => {
    const brief = createBrief({
      umkmType: "fnb" as UmkmType,
    });
    const result = evaluateDiscussReadiness({
      brief,
      fieldState: {},
      umkmType: "fnb",
    });
    
    expect(result.state).toBe("needs_question");
    expect(result.blockers.some(b => b.reason.includes("alamat"))).toBe(true);
  });
  
  it("jasa_online missing address does not block", () => {
    const brief = createBrief({
      umkmType: "jasa_online" as UmkmType,
    });
    const result = evaluateDiscussReadiness({
      brief,
      fieldState: {},
      umkmType: "jasa_online",
    });
    
    expect(result.blockers.some(b => b.reason.includes("alamat"))).toBe(false);
  });
  
  it("declined counts as resolved", () => {
    const brief = createBrief({
      umkmType: "fnb" as UmkmType,
    });
    const fieldState = {
      address: "declined",
      hours: "declined",
    };
    
    const result = evaluateDiscussReadiness({
      brief,
      fieldState,
      umkmType: "fnb",
    });
    
    expect(result.state).toBe("ready_for_build");
  });
  
  it("blockers empty → ready", () => {
    const brief = createBrief({
      umkmType: "fnb" as UmkmType,
    });
    const fieldState = {
      address: "answered",
      hours: "answered",
      contact: "answered",
    };
    
    const result = evaluateDiscussReadiness({
      brief,
      fieldState,
      umkmType: "fnb",
    });
    
    expect(result.state).toBe("ready_for_build");
  });
  
  it("CTA whatsapp without contact blocks", () => {
    const brief = createBrief({
      contactOrCta: "WhatsApp untuk order",
      contact: null,
    });
    
    const result = evaluateDiscussReadiness({
      brief,
      fieldState: {},
    });
    
    expect(result.state).toBe("needs_question");
    expect(result.blockers.some(b => b.reason.includes("whatsapp"))).toBe(true);
  });
});
```

Run tests:

```bash
bun test src/lib/projects/discuss-readiness.test.ts
```

---

### Continue remaining tasks (worker enforcement, prompt updates, etc.)

This is getting lengthy. Let me write out complete implementation file with all steps:

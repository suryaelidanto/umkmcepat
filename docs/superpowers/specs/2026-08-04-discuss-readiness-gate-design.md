# Discuss Readiness Gate + Placeholder Images Spec

**Date:** 2026-08-04  
**Owner:** UmkmCepat Core Team  
**Status:** Ready for implementation  
**Related PRs:** TBD (Phase 1: placeholders first, Phase 2: discuss-readiness gate second)

---

## Executive Summary

Two tightly coupled problems causing user dissatisfaction:

1. **Blank sections after generation** — product cards missing photos render as broken/empty slots because the generator has nowhere to put an image when none exists.
2. **Early builds with incomplete structural facts** — interview ends too soon; user gets a site that looks wrong because core layout decisions (address, hours, CTA destination, visual direction) were guessed instead of asked.

This spec defines two fixes shipped in sequence:

- **Phase 1: Local placeholder SVG** — every generated app bundles a branded placeholder image used whenever a section needs a photo but none exists. Zero CSP change, zero network, no blank sections ever.
- **Phase 2: Deterministic readiness gate** — ask all structurally consequential facts before showing "build" card. Server evaluates readiness; AI cannot recommend build while blockers remain. If user is impatient, show honest warning, then allow through with omitted sections rather than invented content.

Both improvements increase "95% match on first build" so post-build work is editing text/images, not regenerating structure.

---

## Background & Context

### Problem 1: Blank sections (verified, not assumed)

`build-plan.ts:48` declares three strategies:

```ts
imageStrategy: "owner_assets" | "graphic" | "typographic";
```

But `build-planner.ts:274` hardcodes `"typographic"` for everyone. The generator sees image-shaped section requirements (from the brief or prompt hints) but emits `<img>` tags where `src` must be either a real asset or an external URL. External URLs fail under your CSP; absent assets → blank/broken images.

Your existing CSP (`security-headers.ts:60-68`) allows `'self'`, `data:`, `blob:`, three known external hosts, S3 origin. No `placehold.co`, no generic placeholder services. Remote placeholder URLs are off the table.

Solution: **local bundled placeholder** served from `/placeholder.svg`, permitted by `'self'`.

### Problem 2: Early builds (measured via prompt inspection)

Current gates (all probabilistic, model-owned):

- `isBriefReadyForBuild` (`brief.ts:495-501`) checks only three fields: `readyForBuild`, `businessName`, `productOrService.length > 0`.
- Prompts explicitly reward early build:
  - `discuss-tool.ts:260`: "When all mandatory fields and at least 2 soft fields are filled/declined: emit build_recommendation..."
  - `api.projects.preview.ts:717`: "As soon as mandatory + 2 soft are known, recommend building."
  - `discuss-system.md:45`: "Bias heavily toward recommending build early... mandatory + 2 soft = confidence 95+."

Consequence: ~5 questions before build, mixing structural + cosmetic. User often gets wrong primary offer, wrong CTA target, no address/hours for local business. Post-build cost: restructuring hero + menu, re-writing section footers, adding location section, re-skinning visual direction.

**Key insight:** post-generation edits are expensive. Cosmetic swaps = cheap (text-only). Structural changes = expensive (regenerate pages, risk discarding prior edits). Design should block on edit-cost, not completeness.

### Subsystem pieces already built (unwired)

Three subsystems exist but never reach production:

- **Field state tracking** (`chat-memory.ts`) — `FieldStateMap` tracks `asked|answered|declined|explicitly_empty`. But both call sites pass `{}` (`api.projects.preview.ts:369`, `discuss-queue-worker.ts:76`).
- **UMKM typing** (`brief-rich-fields.ts`) — `FIELD_APPLICABILITY` defines applicable soft fields per type. But brief has free-text `businessType` string, no typed `umkmType`.
- **Deterministic evaluator** (`contract-readiness.ts`) — server-owned gate runs only for contract-v1 rollout users, which defaults `off` (`api.projects.ts:481-491`). Legacy-v1 defaulting users get weak gate.

Goal: wire these up for legacy-v1, mirror contract-readiness behavior.

---

## Design Principles

### Block on edit cost

A question earns patience only if its answer changes **structure**:

| Blocks readiness (structural) | Never blocks (cosmetic) |
|---|---|
| primary offer; single vs multiple | tagline wording |
| primary visitor job + CTA + destination | USP phrasing |
| local vs online (address/hours/map exist?) | currentPromo |
| visual direction (re-skin cost) | testimonials |
| visuals / media strategy (has-photos? typographic vs image-led) | certifications, priceRange, socialLinks |

Note inversion in existing code: `build-decisions.ts:118-127` sets `media_strategy.blocksReadiness = false` and `visual_preference.blocksReadiness = false`. Under edit-cost logic this is inverted — both are among the hardest things to change post-build. We fix them here.

### Impatience path: option B (you selected)

User says "langsung bangun aja" while blockers open → **one honest warning naming exactly what will be generic**, then let through. Warning lists unresolved items; blockers marked `skipped` so generator omits rather than invents content (honors no-hallucination rule in `discuss-system.md`).

Rationale: respects autonomy, keeps honesty contract, avoids dead end where impatient user can't reach a build.

### No user-facing metrics

Coverage math stays server-side: no progress bar, no "7/12 answered", no percentage on screen. User experiences it as a consultant who stops asking when ready and says "oke, ini udah cukup buat hasil yang bagus." Internal boolean: `ready === blockers.isEmpty()`.

---

## Phase 1: Local Placeholder SVG (standalone fix)

### Problem statement

Generated sites have image slots but no source. Without a fallback, they're broken/blank. Remote placeholder services blocked by CSP. Solution: embed a branded placeholder SVG in the scaffold, instruct generator to use it.

### Implementation steps

#### Step 1. Add placeholder asset to scaffold

File: `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts`

Add a new file entry:

```ts
{
  path: "public/placeholder.svg",
  content: svgPlaceholderContent(), // function defined below
},
```

Where `svgPlaceholderContent()` returns a small (~2-3KB) SVG with:
- Business initial (letter case-folded from business name) centered
- Subtle gradient background (warm-neutral palette, not pure gray)
- Clean, intentional typography ("No photos yet")
- Crisp at any size via viewBox

#### Step 2. Instruct generator to use placeholder

File: `src/lib/projects/custom-source-generator.ts` line ~2451

Existing guidance:

```ts
UPLOADED IMAGES: when the owner attaches images, read each (vision) + place it where it fits (hero, gallery, product card). Reference each via the mediaPath given in the turn metadata as <img src="/media/<assetId>" alt="<short alt>" /> — NEVER the raw cloud URL. If you cannot understand an image, ask the user where to place it instead of guessing.
```

Append:

```ts
NO IMAGE FALLBACK: if this section requires an image but no photo exists, use <img src="/placeholder.svg" alt="<short description>" /> instead of leaving the slot empty. This ensures the site always renders something intentional.
```

Example output:

```tsx
<img src="/placeholder.svg" alt="Foto produk ayam geprek" />
```

#### Step 3. Tests

File: `src/lib/projects/scaffold/scaffold.test.ts`

Add test ensuring placeholder asset appears in generated file list:

```ts
it("includes placeholder.svg in scaffold public dir", () => {
  const { files } = createScaffoldFiles({ /* minimal schema */ });
  expect(files.some(f => f.path === "public/placeholder.svg")).toBe(true);
});
```

File: `src/lib/projects/custom-source-generator.test.ts`

Add test verifying placeholder usage in generated home route when no images present:

```ts
it("uses placeholder.svg when section requires image but none provided", async () => {
  const result = await generateProjectFromBrief(/* brief without images */, /* turn context */);
  const content = result.files.find(f => f.path === "src/routes/index.tsx").content!;
  expect(content).toContain("/placeholder.svg");
});
```

#### Deliverables checklist

- [ ] `public/placeholder.svg` added to scaffold
- [ ] Generator prompt updated
- [ ] Scaffold test passes
- [ ] Generator test verifies placeholder usage

#### Expected impact

- Zero CSP changes required
- Every generated site renders something visual in image slots
- No network dependency
- Users see intentional design even without photos

---

## Phase 2: Discuss Readiness Gate (server-owned deterministic gate)

### Goal

First build lands at ~95% of what user imagined, reducing post-build edits from 32 total-turns to 17 (model estimate based on edit-cost matrix). Achieved by blocking build until all structural blockers resolved.

### Tasks

#### Task 1. Typed UMKM classification

File: `src/lib/projects/brief.ts`

Add field to `ProjectBrief`:

```ts
export type ProjectBrief = {
  // ... existing fields ...
  umkmType?: UmkmType | null;
};
```

Add to `ProjectBriefPatch`:

```ts
export type ProjectBriefPatch = Partial<
  Pick<ProjectBrief, "..."> & {
    umkmType?: UmkmType | null;
  }
>;
```

Implement parsing in `parseProjectBrief` (`brief.ts:182-184` area) with fallback:

```ts
const umkmType = isObject(source.umkmType) && typeof source.umkmType === "string"
  ? source.umkmType
  : "other";
```

Default to `"other"` if unknown; AI sets value from first relevant answer.

Test additions in `brief.test.ts`:

```ts
it("defaults umkmType to 'other' when unknown", () => {
  const brief = parseProjectBrief({}, "");
  expect(brief.umkmType).toBe("other");
});
```

#### Task 2. Persist field state in brief JSON

File: `src/lib/projects/brief.ts`

Add to `ProjectBrief`:

```ts
fieldState?: FieldStateMap;
```

Extend `mergeProjectBriefPatch` (`brief.ts:239-...`) to merge field state:

```ts
if (patch.fieldState) {
  next.fieldState = { ...next.fieldState, ...patch.fieldState };
}
```

Update `parseProjectBrief` to restore field state from input.

Both call sites fixed to pass real maps instead of `{}`:

- `api.projects.preview.ts:369` → derive from stored field state or initialize from existing data
- `discuss-queue-worker.ts:76` → same

Add test coverage in `brief.test.ts` for field state merging.

#### Task 3. Deterministic readiness evaluator

File: `src/lib/projects/discuss-readiness.ts` (new)

Structure mirrors `contract-readiness.ts` but simplified for legacy-v1:

```ts
import { getApplicableFields, SOFT_FIELDS, type UmkmType } from "./brief-rich-fields";
import type { ProjectBrief } from "./brief";
import type { FieldStateMap } from "./chat-memory";

type DiscussBlocker = {
  fieldId: SoftFieldId;
  reason: string;
};

type DiscussReadiness =
  | { state: "needs_question"; blockers: DiscussBlocker[]; nextFieldId: SoftFieldId | null }
  | { state: "ready_for_build"; blockers: []; omissions: DiscussOmission[] };

type DiscussOmission = {
  fieldId: SoftFieldId;
  reason: "skipped" | "unknown" | "not_applicable";
};

function structuralFieldIds(umkmType?: UmkmType | null): SoftFieldId[] {
  // Return fields considered structural based on edit-cost analysis
  return [
    "contact",           // essential for CTA mapping
    "tagline",           // affects hero, brand consistency
    "usp",               // differentiates value prop
    "targetCustomer",    // shapes messaging, tone
    "priceRange",        // pricing strategy, trust signals
    "visuals",           // image-led vs typographic
    "hours",             // critical for F&B, retail, jasa_lokal
    "address",           // local businesses need map/address section
    "deliveryArea",      // affects service scope display
    "since",             // heritage/trust signal
    "secondaryCta",      // fallback engagement channel
    // Non-structural: paymentMethods, socialLinks, certifications, testimonials, currentPromo
  ].filter(id => id !== "contact"); // contact handled specially
}

export function evaluateDiscussReadiness(input: {
  brief: ProjectBrief;
  fieldState: FieldStateMap;
  umkmType?: UmkmType | null;
}): DiscussReadiness {
  const { brief, fieldState, umkmType } = input;
  const applicable = getApplicableFields(umkmType ?? "other");
  const structural = structuralFieldIds(umkmType).filter(id => applicable.includes(id));
  
  const blockers: DiscussBlocker[] = [];
  const omissions: DiscussOmission[] = [];
  
  for (const field of structural) {
    const state = fieldState[field];
    
    if (!state) {
      // Not yet asked → blocker
      blockers.push({
        fieldId: field,
        reason: `${field} belum dijawab`,
      });
    } else if (state === "asked") {
      // Asked but no answer → blocker (probing allowed once more)
      blockers.push({
        fieldId: field,
        reason: `pertanyaan ${field} belum selesai`,
      });
    } else if (state === "answered") {
      // OK → proceed
      continue;
    } else if (state === "declined" || state === "explicitly_empty") {
      // Explicitly skipped → record omission, not blocker
      omissions.push({
        fieldId: field,
        reason: state === "declined" ? "skipped" : "unknown",
      });
    }
  }
  
  // Cross-field rules (additional constraints beyond individual fields)
  const crossBlockers: string[] = [];
  
  // Rule 1: WhatsApp/order CTA needs contact info
  if (brief.contactOrCta?.toLowerCase().includes("whatsapp") ||
      brief.contactOrCta?.toLowerCase().includes("order")) {
    if (!brief.contact) {
      crossBlockers.push("CTA whatsapp/order tanpa nomor kontak");
    }
  }
  
  // Rule 2: Local types need address unless explicitly skipped
  if ((umkmType === "fnb" || umkmType === "retail" || umkmType === "jasa_lokal") &&
      !brief.address) {
    const addressState = fieldState["address"];
    if (addressState !== "declined" && addressState !== "explicitly_empty") {
      crossBlockers.push("warung/toko/jasa lokal perlu alamat untuk bagian lokasi");
    }
  }
  
  // Rule 3: Multiple offers need primary flagged
  if (Array.isArray(brief.productOrService) && brief.productOrService.length > 1) {
    const hasPrimary = brief.productOrService.some(p => p.isPrimary);
    if (!hasPrimary) {
      crossBlockers.push("beberapa produk, tapi belum ada yang jadi andalan utama");
    }
  }
  
  for (const reason of crossBlockers) {
    blockers.push({
      fieldId: "cross_field",
      reason,
    });
  }
  
  // Determine readiness
  if (blockers.length === 0) {
    return {
      state: "ready_for_build",
      blockers: [],
      omissions,
    };
  }
  
  // Find next unanswered field to ask
  const nextFieldId = findNextUnansweredField(applicable, structural, fieldState);
  
  return {
    state: "needs_question",
    blockers,
    nextFieldId,
  };
}

function findNextUnansweredField(
  applicable: SoftFieldId[],
  structural: SoftFieldId[],
  fieldState: FieldStateMap
): SoftFieldId | null {
  // Prioritize structural first, within structural pick earliest undefined/unanswered
  const candidates = [...structural, ...applicable.filter(id => !structural.includes(id))];
  const answerset = new Set<SofieldId>();
  const declinedSet = new Set<SofieldId>();
  
  for (const [field, state] of Object.entries(fieldState) as Array<[SoftFieldId, FieldState]>) {
    if (state === "answered") {
      answerset.add(field);
    } else if (state === "declined" || state === "explicitly_empty") {
      declinedSet.add(field);
    }
  }
  
  for (const field of candidates) {
    if (!answerset.has(field) && !declinedSet.has(field)) {
      return field;
    }
  }
  
  return null;
}
```

Add unit tests in `discuss-readiness.test.ts`:

```ts
describe("evaluateDiscussReadiness", () => {
  it("fnb missing address blocks", () => {
    const result = evaluateDiscussReadiness({
      brief: createMinimalBrief({ umkmType: "fnb" }),
      fieldState: {},
      umkmType: "fnb",
    });
    expect(result.state).toBe("needs_question");
    expect(result.blockers.some(b => b.reason.includes("alamat"))).toBe(true);
  });
  
  it("jasa_online missing address does not block", () => {
    const result = evaluateDiscussReadiness({
      brief: createMinimalBrief({ umkmType: "jasa_online" }),
      fieldState: {},
      umkmType: "jasa_online",
    });
    expect(result.blockers.some(b => b.reason.includes("alamat"))).toBe(false);
  });
  
  it("declined counts as resolved", () => {
    const result = evaluateDiscussReadiness({
      brief: createMinimalBrief(),
      fieldState: { address: "declined", hours: "declined" },
      umkmType: "fnb",
    });
    expect(result.state).toBe("ready_for_build");
  });
  
  it("blockers empty → ready", () => {
    const result = evaluateDiscussReadiness({
      brief: createCompleteBrief(),
      fieldState: { address: "answered", hours: "answered" },
      umkmType: "fnb",
    });
    expect(result.state).toBe("ready_for_build");
  });
});
```

#### Task 4. Enforce in discuss-turn-worker

File: `src/lib/projects/discuss-turn-worker.ts` around line 801

Find current acceptance logic:

```ts
const assistantMessage: UIMessage = {
  id: messageId,
  role: "assistant",
  parts: [
    { type: "text", text: chatText, state: "done" },
    {
      type: `tool-${PRESENT_WORKSPACE_CARD_TOOL_NAME}`,
      toolCallId: resolvedToolCallId,
      state: "output-available",
      // ...
    }
  ]
};
```

Insert readiness check before persisting:

```ts
// Line ~790: before constructing assistantMessage
if (workspaceTurn.workspaceCard.type === "build_recommendation") {
  const readiness = evaluateDiscussReadiness({
    brief: workspaceTurn.brief,
    fieldState: workspaceTurn.brief.fieldState ?? {},
    umkmType: workspaceTurn.brief.umkmType,
  });
  
  if (readiness.state === "needs_question") {
    // Demote to question card
    const nextQuestionId = readiness.nextFieldId || "general_question";
    
    if (userImpatient && readiness.blockers.length > 0) {
      // Option B: honest warning
      const warningText = `Oke, aku bangun sekarang. Tapi jujur: ${formatBlockersForWarning(readiness.blockers)}`;
      
      workspaceTurn.workspaceCard = {
        type: "question",
        question: {
          id: nextQuestionId,
          question: warningText,
          answerMode: "none",
          selectionMode: "single",
          options: [{ label: "Bangun saja", description: "Lanjut build dengan informasi yang ada" }],
        },
      };
      
      // Mark blockers as skipped for generator
      for (const blocker of readiness.blockers) {
        updateFieldStateToSkipped(blocker.fieldId);
      }
    } else {
      // Keep asking
      workspaceTurn.workspaceCard = {
        type: "question",
        question: {
          id: nextQuestionId,
          question: generateQuestionText(nextQuestionId),
          answerMode: "choice",
          selectionMode: "single",
          options: generateOptionsForField(nextQuestionId),
        },
      };
    }
    
    logEvent("discuss:gate", { projectId, turnId, blockers: readiness.blockers.map(b => b.fieldId) });
  }
}
```

Helper functions to add:

```ts
function formatBlockersForWarning(blockers: DiscussBlocker[]): string {
  return blockers.map(b => `bagian ${b.reason}`).join(", ");
}

function generateQuestionText(fieldId: SoftFieldId): string {
  switch (fieldId) {
    case "address": return "Alamat warungnya dimana? Bagian ini penting supaya pelanggan tahu lokasinya.";
    case "hours": return "Jam berapa buka dan tutupnya? Pelanggan butuh tau kapan bisa datang.";
    case "contact": return "Nomor WA atau telepon apa yang bisa dihubungi?";
    case "primaryOffer": return "Mana yang paling jadi andalan kamu?";
    // ... more mappings
    default: return "Boleh jelaskan lebih detail tentang ini?";
  }
}

function generateOptionsForField(fieldId: SoftFieldId): Array<{label: string, description: string}> {
  switch (fieldId) {
    case "hours": return [
      { label: "Senin-Jumat", description: "Buka regular weekdays" },
      { label: "Setiap hari", description: "Buka 7 hari dalam seminggu" },
      { label: "Tutup Senin", description: "Minggu libur, buka Selasa-Minggu" },
    ];
    // ... more mappings
    default: return [
      { label: "Ya", description: "Ada, mau diisi" },
      { label: "Tidak", description: "Tidak ada / skip" },
    ];
  }
}

function updateFieldStateToSkipped(fieldId: SoftFieldId) {
  workspaceTurn.brief.fieldState = recordFieldDecline(workspaceTurn.brief.fieldState ?? {}, fieldId);
}
```

#### Task 5. Prompt surgery

Files to edit:

1. `api.projects.preview.ts:717` and `:734` — delete these lines:

```ts
// DELETE THIS LINE
"As soon as mandatory fields (business name, product) + 2 soft fields (USP, contact) are known, recommend building."
```

```ts
// DELETE THIS BLOCK
"When recommending build, say: 'Sip, infonya udah cukup banget. Yuk langsung kita bangun!'"
```

2. `discuss-tool.ts:260` and `:266` — remove early-build instructions:

```ts
// DELETE FROM LINES 260-266
"When all mandatory fields (businessName, product) and at least 2 soft fields are filled/declined: emit build_recommendation instead of a question and set confidence to 95+. Prefer choice options with label+description (2-5). Never include a catch-all "other"/"write your own" option — the UI already appends one automatically. Use build_recommendation only when confidence is 95+ or mandatory + 2 soft fields are known. Below that, keep asking a question. Never use any other card type.
Build early — do not extract every field. Once the basics are known, show the build_recommendation card.
If you are asking whether to build now (build confirm), emit type="build_recommendation" — never type="question" with id build_confirm.`;"
```

3. `discuss-system.md:45` — replace bias-heavy section:

```md
# Confidence rule (REPLACED BY SERVER GATE)

Previously: "Bias heavily toward recommending the build early. Once mandatory fields plus at least 2 soft fields are known or explicitly declined, confidence must be 95+ and you must emit the build_recommendation."

New: **Let server decide when ready.** Focus on asking complete, specific questions. Never claim readiness below true 95%. Probe vague answers once, then accept or move on.
```

4. Add brutal-honesty section to `discuss-system.md` after existing confidence rule:

```md
# Brutal honesty about readiness

Do NOT say "infonya udah cukup" or similar while structural blockers remain open. Your job is to keep asking until resolved OR until user explicitly requests to build early.

When probing:
- Ask ONE clear question per turn.
- Give user chance to answer OR skip.
- When skipping accepted, name the tradeoff: "Oke, saya skip bagian X — nanti situsnya akan terasa umum di bagian itu, gampang ditambah setelah build."

When user says "langsung bangun aja":
- Show ONE honest warning listing unresolved items.
- Record them as skipped so generator omits rather than invents content.
- Recommend proceeding with understanding they can edit later.

DO NOT hallucinate fields. Leave unknowns empty; server decides build timing.
```

#### Task 6. Fix decision flags

File: `src/lib/projects/build-decisions.ts:118-127`

Change:

```ts
{
  id: "media_strategy",
  target: "media_strategy",
  applicability: "image_led",
  blocksReadiness: true,  // was false
  skipPolicy: "safe_omission",
  outputEffect: "owner assets vs graphic/typographic",
},
{
  id: "visual_preference",
  target: "visual_preference",
  applicability: "always",
  blocksReadiness: true,  // was false
  skipPolicy: "safe_omission",
  outputEffect: "tone, density, motion, direction",
},
```

#### Task 7. Tests

Integration test extension: `tests/integration/discussion-readiness.test.ts`

Add cases:

```ts
import { evaluateDiscussReadiness } from "@/lib/projects/discuss-readiness";
import { recordFieldAnswer, recordFieldDecline } from "@/lib/projects/chat-memory";

describe("discussion readiness integration", () => {
  it("worker demotes premature build_recommendation to question", async () => {
    // Simulate AI proposing build_recommendation while blockers exist
    // Verify worker rewrites to question card for next unanswered field
    // Assert builder logs discuss:gate event
  });
  
  it("impatient user passes with honest warning", async () => {
    // Simulate user saying "langsung bangun aja"
    // Verify warning text appears, blockers marked skipped, build goes through
    // Assert blockers logged as skipped omissions
  });
  
  it("blocked fields accumulate correctly across turns", async () => {
    // Simulate multi-turn interview with gradual field resolution
    // Verify readiness gate becomes true only when all blockers resolved
  });
});
```

---

## Deployment Plan

### Phase 1 (placeholders) — standalone, low risk

1. **PR #1:** Add `public/placeholder.svg` to scaffold, update generator prompt, add tests.
2. **Deploy:** Immediate rollout to all users, no opt-in required.
3. **Monitor:** Watch CSP violation logs for broken image references (should decrease), watch builder logs for placeholder usage.
4. **Expected outcome:** Zero blank sections in generated sites immediately.

### Phase 2 (discuss-readiness) — larger scope

1. **PR #2:** Add `umkmType`, `fieldState`, implement `evaluateDiscussReadiness`, enforce in worker, update prompts, fix decision flags.
2. **QA:** Run all unit tests, integration tests with simulated interviews.
3. **Gradual rollout:** Enable for 10% of users initially, monitor time-to-build, edit count, user feedback.
4. **Full rollout:** After 1 week of good metrics (lower post-build edits, higher satisfaction scores).
5. **Monitor:** `discuss:gate` events (count, blocker types), average turns before build, conversion rate from discussion to build, post-build edit frequency.

---

## Acceptance Criteria

### Phase 1 (placeholders)

- [ ] Every generated project includes `public/placeholder.svg`
- [ ] Generated routes reference placeholder when no image available
- [ ] No CSP violations for placeholder images
- [ ] Visual check confirms placeholder looks intentional, not broken

### Phase 2 (discuss-readiness)

- [ ] `evaluateDiscussReadiness` returns correct blockers/ready status
- [ ] Worker prevents `build_recommendation` while blockers remain
- [ ] Impatient user sees honest warning, proceeds with omitted sections
- [ ] Field state persists across turns and survives rebuild
- [ ] Average turns before build increased to 8-12 (was ~5)
- [ ] Post-build edit rate decreased by ≥40% (based on A/B comparison)
- [ ] No regressions in existing functionality

---

## Risks & Mitigations

### Risk: AI continues to propose build despite gate

**Mitigation:** Hard enforcement in worker overrides AI proposals. If AI proposes build_recommendation with blockers, worker silently replaces with question card.

### Risk: Interview feels too long

**Mitigation:** Default to typographic layout for no-photo → fast builds. Only ask structural fields relevant to UMKM type. Allow skip → still moves forward.

### Risk: Generator bug leaves placeholders unrendered

**Mitigation:** Phase 1 shipped first validates placeholder works independently. Generator tests verify placeholder usage.

### Risk: Impatient user bypasses gate consistently

**Mitigation:** Honest warning ensures transparency. User informed what's generic. Track skip rates; if high, reconsider blocker definitions.

---

## Open Questions

1. **Placeholder shape:** Branded initial + subtle gradient (recommended) vs neutral gradient only?
2. **Scope sequencing:** Ship Phase 1 first, then Phase 2? (Recommended)
3. **Visuals blocking:** Should `visuals` (has-photos) truly block given common case of no photos yet? Recommended approach: blocking yes, because answer routes to complete typographic design, not blank.

Awaiting confirmation on these before implementation begins.

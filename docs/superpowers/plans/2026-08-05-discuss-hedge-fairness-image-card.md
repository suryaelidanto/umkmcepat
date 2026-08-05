# Discuss Hedge Fairness + Image-Upload Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Price hedged discuss energy per-model (not winner-priced), guarantee workspace cards carry minimum richness (placeholder + multi-select), and add an `image_upload` workspace card that collects jpeg/png/webp images (single or multiple, always skippable) which the build agent then places for real in the generated site.

**Architecture:** Three independent subsystems landed in sequence. (1) A `calculateEnergyCost` helper already exists (user-credits.ts:73) and is reused to price each discuss leg at its own model, summed into one UserCredit debit. (2) Card richness is enforced by normalizing missing placeholder defaults and hardening the discuss prompt. (3) A new `image_upload` card type threads through the existing card pipeline (brief union → tool schema → normalizer → UI → workspace answers → persisted brief → build prompt) and closes the currently-unwired `mediaPaths` gap so the build agent's existing UPLOADED IMAGES placement instruction (custom-source-generator.ts:2457) finally has real image refs to act on.

**Tech Stack:** Bun, TypeScript, TanStack Start, Prisma/Postgres, Vitest, AI SDK (`streamText`, tool calls), shadcn/ui, MinIO/S3.

## Global Constraints

- Work from `dev`; atomic Conventional Commits per task.
- TDD: write failing test → run to confirm fail → implement → run to confirm pass.
- Run unit tests with `bunx vitest run --project unit <file>`. Full gate: `bun run check`.
- Use Bun only; keep `bun.lock` canonical.
- Docs are part of the change (AGENTS.md/DEV.md/spec/plan) when behavior changes.
- Never commit `.env`, secrets, uploads, logs, `.next/`, `.pi/`, `.browser/`, coverage artifacts.
- `WorkspaceCard` must stay backward-compatible: `type` stays a loose string at parse; new `image_upload` type is additive.
- Image-only uploads: jpeg/png/webp only, ≤5MB — consistent with existing `uploadTempImage` / `api/projects/$id/assets/upload`.
- Image card is optional by default (`required !== true` → user can skip). No card ever forces an image.
- User-facing UI copy in Indonesian; dev-facing code/logs in English.

---

### Task 1: Per-model energy pricing for hedged discuss

**Problem recap:** `discuss-turn-worker.ts` sums primary + all hedge-leg tokens (lines ~728-732) then calls `chargeEnergyForAiUsage({ modelId: discussModelId, ... })` once (line ~1397). `addEnergyUsage` (user-credits.ts:108-158) prices ALL tokens at the single `modelId`'s rate (the winner's). So aborted legs' tokens are billed at the winner's price, not their own.

**Fix:** Price each leg at its own model; sum the *energy* into one UserCredit debit. Add a `legs`-based API to `user-credits.ts` that computes per-model cost and writes one row with summed tokens.

**Files:**
- Modify: `src/lib/user-credits.ts`
- Create: `src/lib/user-credits.priced-legs.test.ts`
- Modify: `src/lib/projects/discuss-turn-worker.ts`

**Interfaces:**
- Consumes: existing `calculateEnergyCost(modelId, inputTokens, outputTokens)` (user-credits.ts:73-81), `resolveModelPricing`.
- Produces: `addEnergyUsageLegs(userId, legs: EnergyUsageLeg[], options): Promise<{energyUsed, inputTokens, outputTokens} | null>` where `type EnergyUsageLeg = { modelId: string; inputTokens: number; outputTokens: number }`. It returns `null` when total tokens are 0. `addEnergyUsage` and `chargeEnergyForAiUsage` stay unchanged for non-hedged paths.

- [ ] **Step 1: Write the failing test**

`src/lib/user-credits.priced-legs.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { mockEnergyPricing } from "@/lib/energy-pricing.test-util";

describe("addEnergyUsageLegs", () => {
  it("sums per-leg energy at each leg's own model price into one debit", async () => {
    vi.stubGlobal(
      "resolveModelPricing",
      vi.fn(async (id: string) =>
        mockEnergyPricing(
          id === "modelA" ? { prompt: 1e-6, completion: 2e-6 } : { prompt: 3e-6, completion: 4e-6 },
        ),
      ),
    );
    const { addEnergyUsageLegs } = await import("./user-credits");
    const { prisma } = await import("@/lib/prisma");
    const tx = { $executeRaw: vi.fn().mockResolvedValue(1) };
    vi.spyOn(prisma, "$transaction").mockResolvedValue(undefined);
    // ...
  });
});
```

_Note: match the existing mock style used by `user-credits.test.ts` (see `src/lib/user-credits.test.ts` for how `resolveModelPricing` and `prisma.$transaction` are mocked). Write an assertion that the single INSERT row's `amount` equals `calc(modelA, inA, outA) + calc(modelB, inB, outB)`, NOT `calc(modelA, inA+inB, outA+outB)`._

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run --project unit src/lib/user-credits.priced-legs.test.ts`
Expected: FAIL — `addEnergyUsageLegs is not defined`.

- [ ] **Step 3: Implement `addEnergyUsageLegs`**

In `src/lib/user-credits.ts`, after `addEnergyUsage`:

```ts
export type EnergyUsageLeg = {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
};

export async function addEnergyUsageLegs(
  userId: string,
  legs: EnergyUsageLeg[],
  reason: string,
  options: { projectId?: string | null } = {},
): Promise<{ energyUsed: number; inputTokens: number; outputTokens: number } | null> {
  let totalInput = 0;
  let totalOutput = 0;
  let energyUsed = 0;
  let pricedModelId = "unknown";
  for (const leg of legs) {
    const input = Math.max(0, Math.floor(leg.inputTokens));
    const output = Math.max(0, Math.floor(leg.outputTokens));
    totalInput += input;
    totalOutput += output;
    if (input > 0 || output > 0) {
      const pricing = await resolveModelPricing(leg.modelId.trim() || "unknown");
      energyUsed += calculateEnergyCostFromPricing(pricing, input, output);
      pricedModelId = pricing.rawModelId;
    }
  }
  if (energyUsed <= 0) {
    return { energyUsed: 0, inputTokens: 0, outputTokens: 0 };
  }

  const expiry = new Date("9999-12-31T23:59:59.999Z");
  const pricing = await resolveModelPricing(pricedModelId);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    await tx.$executeRaw`
      INSERT INTO "UserCredit" ("id", "userId", "projectId", "amount", "inputTokens", "outputTokens", "rawModelId", "pricedModelId", "pricingSource", "promptPrice", "completionPrice", "reason", "expiresAt", "createdAt")
      VALUES (
        ${`c${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`},
        ${userId},
        ${options.projectId ?? null},
        ${-energyUsed},
        ${totalInput},
        ${totalOutput},
        ${pricing.rawModelId.slice(0, 160)},
        ${pricing.pricedModelId.slice(0, 160)},
        ${pricing.pricingSource.slice(0, 32)},
        ${pricing.promptPrice},
        ${pricing.completionPrice},
        ${reason.slice(0, 64)},
        ${expiry},
        NOW()
      )
    `;
  });

  logCreditTransaction({
    type: "debit",
    userId,
    amount: -energyUsed,
    reason,
    projectId: options.projectId,
  });

  return { energyUsed, inputTokens: totalInput, outputTokens: totalOutput };
}
```

_Note: `pricedModelId` uses the last non-zero leg's pricing as the *displayed* pricedModelId for the row (single-row accounting). If the existing test file has a `calculateEnergyCostFromPricing` import that is module-private, keep it private and use `calculateEnergyCost` per leg instead — adjust the implementation to call `calculateEnergyCost` per leg and sum, which is cleaner and avoids exposing the private helper._

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run --project unit src/lib/user-credits.priced-legs.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire discuss-turn-worker to use per-leg pricing**

In `src/lib/projects/discuss-turn-worker.ts`, replace the single `chargeEnergyForAiUsage` used in the hedged main success path (line ~1397) with per-leg accounting. Add a helper near the debit that builds the leg list:

```ts
function buildHedgeLegs(primary: { model: string; input: number; output: number }, outcomes: HedgeOutcome[], hedgeNames: string[]): EnergyUsageLeg[] {
  const legs: EnergyUsageLeg[] = [
    { modelId: primary.model, inputTokens: primary.input, outputTokens: primary.output },
  ];
  for (let i = 0; i < hedgeNames.length; i++) {
    const outcome = outcomes[i];
    legs.push({
      modelId: hedgeNames[i],
      inputTokens: outcome.usage.inputTokens ?? 0,
      outputTokens: outcome.usage.outputTokens ?? 0,
    });
  }
  return legs;
}
```

Then, at the debit site (only in the **hedged** branch where `hedged === true` and the turn reaches the final success path), replace `chargeEnergyForAiUsage({ userId, modelId: discussModelId, ... })` with:

```ts
await addEnergyUsageLegs(
  userId,
  buildHedgeLegs(
    { model: primaryOwnModel, input: primaryOwnInputTokens, output: primaryOwnOutputTokens },
    hedgeOutcomes,
    hedgeModelNames,
  ),
  "discuss:step",
  { projectId: project.id },
);
```

where `primaryOwnModel` is the primary's own requested model (`modelName`), NOT the winner. Keep `chargeEnergyForAiUsage` for all non-hedged branches unchanged.

**Important:** the debits in the many `hadError`/degraded/repair early-return branches must also be reviewed — if the turn was `hedged`, use `addEnergyUsageLegs`; if unhedged, keep `chargeEnergyForAiUsage`. Prefer a single helper `chargeDiscussEnergy({ hedged, userId, projectId, modelName, hedgeModelNames, hedgeOutcomes, primaryOwnInputTokens, primaryOwnOutputTokens })` that internally routes to the right function, and call it at every debit site. This centralizes the routing and avoids missing a branch.

- [ ] **Step 6: Update/extend the discuss-turn-worker test**

Add to `src/lib/projects/discuss-turn-worker.test.ts` (or the batched variant) a test asserting the hedged success path calls `addEnergyUsageLegs` with the correct leg list (primary own model + each hedge model), while the unhedged path still calls `chargeEnergyForAiUsage`.

- [ ] **Step 7: Run the touched test suites**

Run: `bunx vitest run --project unit src/lib/user-credits.priced-legs.test.ts src/lib/projects/discuss-turn-worker.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/user-credits.ts src/lib/user-credits.priced-legs.test.ts src/lib/projects/discuss-turn-worker.ts src/lib/projects/discuss-turn-worker.test.ts
git commit -m "fix(energy): price hedged discuss legs per-model into one debit"
```

---

### Task 2: Card richness — placeholder backfill + prompt hardening

**Problem recap:** The hedge promotes the fastest parseable card. Cheap winning models (glm-4.6v / minimax-m3) emit minimal cards: no `placeholder`, `selectionMode: "single"` always. So text inputs fall back to the literal "Tulis jawabanmu di sini..." and multi-select never appears, even though schema/UI/prompt support both.

**Fix (B1, no latency trade):**
1. In `discuss-turn-worker.ts`, after a winner is adopted (hedge or primary), backfill a default `placeholder` when the winning text question lacks one.
2. Harden the discuss prompt (`discuss-tool.ts`) to always emit placeholder for text questions and to use `multiple` when the answer naturally allows several.

**Files:**
- Modify: `src/lib/projects/discuss-turn-worker.ts`
- Modify: `src/lib/projects/discuss-tool.ts`
- Create: `src/lib/projects/card-richness.test.ts`
- Modify: `src/lib/projects/discuss-turn-worker.test.ts` (if prompt assertions exist)

**Interfaces:**
- Consumes: `WorkspaceCard`, `BriefQuestion`.
- Produces: exported `ensureQuestionCardRichness(card: WorkspaceCard): WorkspaceCard` — if `card.type === "question"` and `answerMode === "text"` and no `placeholder`, sets a default placeholder derived from the question text (e.g. `Contoh jawaban untuk "${question.question}"` truncated, or a generic `Tulis jawaban kamu di sini.`). Returns the card unchanged otherwise. Used post-adoption in the worker.

- [ ] **Step 1: Write the failing test**

`src/lib/projects/card-richness.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ensureQuestionCardRichness } from "./card-richness";
import { type WorkspaceCard } from "./brief";

describe("ensureQuestionCardRichness", () => {
  it("adds a placeholder to a text question that lacks one", () => {
    const card: WorkspaceCard = {
      type: "question",
      question: { id: "q1", question: "Nama usaha kamu?", answerMode: "text", options: [] },
    };
    const out = ensureQuestionCardRichness(card);
    expect(out.type).toBe("question");
    if (out.type === "question") {
      expect(out.question.placeholder).toBeTruthy();
    }
  });

  it("keeps an existing placeholder", () => {
    const card: WorkspaceCard = {
      type: "question",
      question: { id: "q1", question: "Q?", answerMode: "text", placeholder: "Contoh: Kopi Senja", options: [] },
    };
    const out = ensureQuestionCardRichness(card);
    expect(out.type).toBe("question");
    if (out.type === "question") expect(out.question.placeholder).toBe("Contoh: Kopi Senja");
  });

  it("leaves choice and non-question cards untouched", () => {
    const choice: WorkspaceCard = { type: "question", question: { id: "q2", question: "C?", answerMode: "choice", options: [{ label: "a", description: "d" }] } };
    expect(ensureQuestionCardRichness(choice)).toEqual(choice);
    expect(ensureQuestionCardRichness({ type: "none" })).toEqual({ type: "none" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run --project unit src/lib/projects/card-richness.test.ts`
Expected: FAIL — module `./card-richness` not found.

- [ ] **Step 3: Implement `ensureQuestionCardRichness`**

`src/lib/projects/card-richness.ts`:

```ts
import { type WorkspaceCard } from "./brief";

const FALLBACK_PLACEHOLDER = "Tulis jawaban kamu di sini.";

export function ensureQuestionCardRichness(card: WorkspaceCard): WorkspaceCard {
  if (card.type !== "question") return card;
  const q = card.question;
  if (q.answerMode === "text" && !q.placeholder) {
    return {
      type: "question",
      question: {
        ...q,
        placeholder: FALLBACK_PLACEHOLDER,
      },
    };
  }
  return card;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run --project unit src/lib/projects/card-richness.test.ts`
Expected: PASS.

- [ ] **Step 5: Apply richness backfill in the worker**

In `discuss-turn-worker.ts`, apply `ensureQuestionCardRichness` right after winner adoption. In the primary loop, when a `tool-call` part arrives, after `toolInput` is set and before it's used for normalization, assign `workspaceTurn.workspaceCard = ensureQuestionCardRichness(workspaceTurn.workspaceCard)`. Also apply it in `adoptHedgeWinner` (after `toolInput = winner.toolInput`). Keep the change surgical: normalize the card, then enrich.

- [ ] **Step 6: Harden the discuss prompt**

In `src/lib/projects/discuss-tool.ts` `buildOneCallSystemPrompt` (the non-hasBuiltSite branch, line ~248) and `buildCardSystemPrompt` (line ~276), strengthen the instruction for `placeholder` and `selectionMode`:

Add to the interview-discipline block (or the "For type question" guidance):

```
- For answerMode "text", ALWAYS set placeholder (short Indonesian example, e.g. "Contoh: Kopi Senja").
- For answerMode "choice", set selectionMode "multiple" only when the answer naturally allows several choices (e.g. "produk apa saja"), otherwise "single".
```

Keep it concise and Indonesian-aligned.

- [ ] **Step 7: Run touched suites**

Run: `bunx vitest run --project unit src/lib/projects/card-richness.test.ts src/lib/projects/discuss-turn-worker.test.ts src/lib/projects/discuss-tool.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/projects/card-richness.ts src/lib/projects/card-richness.test.ts src/lib/projects/discuss-turn-worker.ts src/lib/projects/discuss-tool.ts
git commit -m "fix(discuss): backfill placeholder + harden prompt for card richness"
```

---

### Task 3: `image_upload` card — type, schema, normalization

Add the new card variant to the type union, tool schema, and normalizer.

**Files:**
- Modify: `src/lib/projects/brief.ts` (WorkspaceCard union + new `ImageUploadCard` type)
- Modify: `src/lib/projects/brief-flow.ts` (`normalizeWorkspaceCard` handles `image_upload`)
- Modify: `src/lib/projects/discuss-tool.ts` (tool schema `workspaceCard` union + prompt guidance)
- Create: `src/lib/projects/image-upload-card.test.ts`

**Interfaces:**
- Consumes: existing `WorkspaceCard` union in brief.ts.
- Produces:
  - `type ImageUploadCard = { type: "image_upload"; imageUpload: { id: string; question: string; hint?: string; selectionMode: "single" | "multiple"; purpose: "business-image" | "logo" | "reference"; required?: boolean } }`.
  - `WorkspaceCard` gains `| ImageUploadCard`.
  - `normalizeWorkspaceCard` returns an `ImageUploadCard` for `value.type === "image_upload"` (validating/normalizing fields, defaulting `selectionMode` to `"single"` and `required` to `false`).
  - `createImageUploadCard(raw: unknown): ImageUploadCard | null` — returns `null` when not a valid image_upload shape.

- [ ] **Step 1: Write the failing test**

`src/lib/projects/image-upload-card.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createImageUploadCard } from "./brief-flow";

describe("createImageUploadCard", () => {
  it("normalizes a valid image_upload card", () => {
    const card = createImageUploadCard({
      type: "image_upload",
      imageUpload: { id: "img1", question: "Upload foto produk?", selectionMode: "multiple", purpose: "business-image" },
    });
    expect(card).toEqual({
      type: "image_upload",
      imageUpload: { id: "img1", question: "Upload foto produk?", hint: undefined, selectionMode: "multiple", purpose: "business-image", required: false },
    });
  });

  it("defaults selectionMode to single and required to false", () => {
    const card = createImageUploadCard({
      type: "image_upload",
      imageUpload: { id: "img2", question: "Logo?", purpose: "logo" },
    });
    expect(card?.imageUpload.selectionMode).toBe("single");
    expect(card?.imageUpload.required).toBe(false);
  });

  it("returns null for an invalid shape", () => {
    expect(createImageUploadCard({ type: "question", question: {} })).toBeNull();
    expect(createImageUploadCard(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run --project unit src/lib/projects/image-upload-card.test.ts`
Expected: FAIL — `createImageUploadCard is not defined`.

- [ ] **Step 3: Add the type to brief.ts**

In `src/lib/projects/brief.ts`, after `BriefQuestion`, add:

```ts
export type ImageUploadPurpose = "business-image" | "logo" | "reference";

export type ImageUploadQuestion = {
  id: string;
  question: string;
  hint?: string;
  selectionMode: "single" | "multiple";
  purpose: ImageUploadPurpose;
  /** Default false → user can skip with the existing skip affordance. */
  required?: boolean;
};
```

Add `| { type: "image_upload"; imageUpload: ImageUploadQuestion }` to the `WorkspaceCard` union.

- [ ] **Step 4: Implement `createImageUploadCard` + wire normalizeWorkspaceCard**

In `src/lib/projects/brief-flow.ts`:

```ts
const IMAGE_UPLOAD_PURPOSES = new Set(["business-image", "logo", "reference"]);

export function createImageUploadCard(raw: unknown): ImageUploadCard | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  if (src.type !== "image_upload") return null;
  const img = (src.imageUpload ?? {}) as Record<string, unknown>;
  const id = typeof img.id === "string" ? img.id.slice(0, 100) : "";
  const question = typeof img.question === "string" ? img.question.slice(0, 300) : "";
  if (!id || !question) return null;
  const purpose = typeof img.purpose === "string" && IMAGE_UPLOAD_PURPOSES.has(img.purpose) ? (img.purpose as ImageUploadPurpose) : "business-image";
  const selectionMode = img.selectionMode === "multiple" ? "multiple" : "single";
  const hint = typeof img.hint === "string" ? img.hint.slice(0, 180) : undefined;
  const required = img.required === true;
  return { type: "image_upload", imageUpload: { id, question, hint, selectionMode, purpose, required } };
}
```

In `normalizeWorkspaceCard`, add a branch before the generic question handling:

```ts
if (value.type === "image_upload") {
  return createImageUploadCard({ type: "image_upload", imageUpload: value.imageUpload }) ?? createFallbackWorkspaceCard(brief);
}
```

Update the `value` cast in `normalizeWorkspaceCard` to include `imageUpload?: unknown`.

- [ ] **Step 5: Extend the tool schema + prompt in discuss-tool.ts**

In `discuss-tool.ts`, extend the `workspaceCard` schema object (and the prompt's "For type question" guidance) with an `image_upload` variant so the AI can emit it:

Add to the card `z.object` a `type` union acceptance — the schema currently uses `type: z.string()`, so no change is required there. Add `imageUpload: z.object({ id: z.string(), question: z.string(), hint: z.string().optional(), selectionMode: z.enum(["single", "multiple"]).optional(), purpose: z.enum(["business-image", "logo", "reference"]).optional(), required: z.boolean().optional() }).optional()` to the workspaceCard object. Update the prompt guidance (`buildCardSystemPrompt` / `buildOneCallSystemPrompt`) to mention: `type "image_upload"` with an `imageUpload` object (id, question, selectionMode single|multiple, purpose business-image|logo|reference, optional) when you need the owner to upload one or more images (e.g. logo, product photos); the server keeps it optional.

- [ ] **Step 6: Run touched suites**

Run: `bunx vitest run --project unit src/lib/projects/image-upload-card.test.ts src/lib/projects/brief-flow.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/brief.ts src/lib/projects/brief-flow.ts src/lib/projects/discuss-tool.ts src/lib/projects/image-upload-card.test.ts
git commit -m "feat(discuss): add image_upload workspace card type + normalization"
```

---

### Task 4: `image_upload` card UI

Render the image-upload card in the workspace composer: dropzone → temp upload (image-only) → thumbnails → submit posts assetIds. Reuse existing `uploadTempImageFile` + `ImageUploadThumb`.

**Files:**
- Modify: `src/components/projects/WorkspacePrimitives.tsx` (new `ImageUploadComposer`)
- Modify: `src/components/projects/WorkspaceShell.tsx` (render `ImageUploadComposer` for `card.type === "image_upload"`)
- Create: `src/components/projects/WorkspaceImageUpload.stories.tsx` (Storybook, per AGENTS.md: new reusable UI goes to Storybook)

**Interfaces:**
- Consumes: `ImageUploadCard`, `uploadTempImageFile` (src/lib/uploads/temp-image-client.ts), `ImageUploadThumb` (src/components/ui/image-upload-thumb.tsx), `createUploadedImageFilePart` (src/lib/projects/chat-file-parts.ts).
- Produces: `ImageUploadComposer({ imageUpload, onClose?, onSubmit })` where `onSubmit(answerText, workspaceAnswers)` receives `workspaceAnswers` with a new field `assetIds?: string[]`.

- [ ] **Step 1: Extend `WorkspaceAnswerPayload` to carry assetIds**

In `src/lib/projects/workspace-answers.ts`, add `assetIds?: string[]` to `WorkspaceAnswerPayload`. Update `buildBriefPatchFromWorkspaceAnswers` so that when an answer carries `assetIds`, it writes `patch.businessImages = [...(patch.businessImages ?? []), ...assetIds]` (businessImages field lands in Task 5; for now keep the write guarded by existence of the field type).

Write a test in a new `src/lib/projects/workspace-answers.image.test.ts`:
- Given an `image_upload` card and an answer with `assetIds: ["a1","a2"]`, the resulting patch includes `businessImages` containing `a1`, `a2`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run --project unit src/lib/projects/workspace-answers.image.test.ts`
Expected: FAIL — `businessImages` not present.

- [ ] **Step 3: Implement `ImageUploadComposer`**

In `WorkspacePrimitives.tsx`, add `ImageUploadComposer` mirroring `QuestionComposer`'s props/skip shape. Use `uploadTempImageFile` per selected file (image-only accept), track `assetIds`/`urls` in state, render `ImageUploadThumb` list, and an optional skip via the same `required !== true` gate used by text/choice. On submit, call `onSubmit("Gambar diunggah", [{ questionId: imageUpload.id, answer: "<n> gambar diunggah", assetIds, source: "custom" }])`.

Use `accept="image/png,image/jpeg,image/webp"` (consistent with ComposerAttachments.tsx:65).

- [ ] **Step 4: Wire into WorkspaceShell**

In `WorkspaceShell.tsx`, extend the render guard that currently checks `workspaceCard.type === "question"` (line ~2873) so it also renders `ImageUploadComposer` for `workspaceCard.type === "image_upload"`. Keep `composerState === "question"` semantics or add an equivalent gate.

- [ ] **Step 5: Add Storybook story**

Create `src/components/projects/WorkspaceImageUpload.stories.tsx` covering single and multiple selection with the skip affordance.

- [ ] **Step 6: Run tests + typecheck**

Run: `bunx vitest run --project unit src/lib/projects/workspace-answers.image.test.ts`
Run: `bunx tsc --noEmit` (or `bun run check`'s typecheck portion).
Expected: PASS + no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/workspace-answers.ts src/lib/projects/workspace-answers.image.test.ts src/components/projects/WorkspacePrimitives.tsx src/components/projects/WorkspaceShell.tsx src/components/projects/WorkspaceImageUpload.stories.tsx
git commit -m "feat(ui): render image_upload workspace card"
```

---

### Task 5: Persist businessImages in the brief + feed the build

Close the placement gap: persist collected image refs into the brief and emit them in `briefToBuildPrompt` so the build agent's existing UPLOADED IMAGES instruction has real mediaPaths.

**Files:**
- Modify: `src/lib/projects/brief.ts` (ProjectBrief type + parse + createInitialBrief + briefToBuildPrompt)
- Modify: `src/lib/projects/discuss-turn-shared.ts` (`scrubBriefForStorage`)
- Modify: `src/lib/projects/workspace-answers.ts` (businessImages patch write — already started Task 4)
- Create: `src/lib/projects/business-images.test.ts`

**Interfaces:**
- Consumes: `parseProjectBrief`, `validateBrief`, `scrubBriefForStorage`.
- Produces:
  - `ProjectBrief.businessImages: BusinessImageRef[]` where `type BusinessImageRef = { id: string; purpose: ImageUploadPurpose }`.
  - `parseProjectBrief` normalizes `input.businessImages` (filter to `{id,purpose}` with valid purpose).
  - `briefToBuildPrompt` emits `Gambar pelanggan: <id> (purpose); ...` when non-empty.
  - `scrubBriefForStorage` preserves/merges `businessImages`.

- [ ] **Step 1: Write the failing test**

`src/lib/projects/business-images.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseProjectBrief, briefToBuildPrompt } from "./brief";

describe("businessImages", () => {
  it("parses and normalizes businessImages", () => {
    const brief = parseProjectBrief({
      businessImages: [{ id: "a1", purpose: "business-image" }, { id: "a2", purpose: "logo" }, { id: "a3", purpose: "bogus" as never }],
    }, "prompt");
    expect(brief.businessImages).toEqual([
      { id: "a1", purpose: "business-image" },
      { id: "a2", purpose: "logo" },
    ]);
  });

  it("includes businessImages in the build prompt", () => {
    const brief = parseProjectBrief({ businessImages: [{ id: "a1", purpose: "business-image" }] }, "prompt");
    expect(briefToBuildPrompt(brief)).toContain("a1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run --project unit src/lib/projects/business-images.test.ts`
Expected: FAIL — `businessImages` undefined.

- [ ] **Step 3: Add the type + parse + prompt emission in brief.ts**

In `brief.ts`:
- Add `import type { ImageUploadPurpose } from "@/lib/projects/brief-flow"` — but avoid a cycle. **Better:** move `ImageUploadPurpose` into `brief.ts` and re-export from `brief-flow.ts` (or define it in brief.ts). Define `ImageUploadPurpose` and `BusinessImageRef` in brief.ts; have brief-flow import from brief.
- Add `businessImages: BusinessImageRef[]` to `ProjectBrief`.
- In `createInitialBrief`, add `businessImages: []`.
- In `parseProjectBrief`, add:

```ts
businessImages: Array.isArray(input.businessImages)
  ? input.businessImages
      .filter((img): img is BusinessImageRef => {
        const i = img as Partial<BusinessImageRef> | null;
        return Boolean(i && typeof i.id === "string" && i.id && (i.purpose === "business-image" || i.purpose === "logo" || i.purpose === "reference"));
      })
      .map((img) => ({ id: img.id.slice(0, 200), purpose: img.purpose }))
      .slice(-12)
  : [],
```

- In `briefToBuildPrompt`, before `notes` line (or after), add:

```ts
brief.businessImages?.length
  ? `Gambar pelanggan: ${brief.businessImages.map((img) => `/media/${img.id} (${img.purpose})`).join("; ")}`
  : "",
```

- [ ] **Step 4: Update scrubBriefForStorage**

In `discuss-turn-shared.ts` `scrubBriefForStorage`, ensure `businessImages` is carried through (the spread `...brief` already does; just confirm it's not stripped). No change needed if spread preserves it — add an assertion to the business-images test that `scrubBriefForStorage` keeps `businessImages`.

- [ ] **Step 5: Wire the workspace-answers patch to write businessImages**

In `workspace-answers.ts` Task-4 step, ensure `patch.businessImages` is written (type must exist on `ProjectBriefPatch` — add `businessImages?: BusinessImageRef[]` to `ProjectBriefPatch` in brief.ts).

- [ ] **Step 6: Run touched suites**

Run: `bunx vitest run --project unit src/lib/projects/business-images.test.ts src/lib/projects/workspace-answers.image.test.ts src/lib/projects/brief.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/brief.ts src/lib/projects/brief-flow.ts src/lib/projects/discuss-turn-shared.ts src/lib/projects/workspace-answers.ts src/lib/projects/business-images.test.ts src/lib/projects/workspace-answers.image.test.ts
git commit -m "feat(brief): persist businessImages and feed build prompt for placement"
```

---

### Task 6: Close the client→server upload wiring

**Gap:** `WorkspaceShell.tsx` sends `mediaPaths` in the body (line ~2272) but `api.projects.preview.ts` never reads it. The image card's answer will flow via `workspaceAnswers` (already read). Confirm and, if needed, wire the chat composer's image attachments to persist as businessImages so first-turn/home-form images also reach the build.

**Files:**
- Modify: `src/routes/api.projects.preview.ts`
- Modify: `src/components/projects/WorkspaceShell.tsx`
- Test: `src/routes/-api.projects.preview.discuss.test.ts`

**Interfaces:**
- Consumes: `parseProjectBrief`, `buildBriefPatchFromWorkspaceAnswers`.
- Produces: preview route persists `businessImages` accumulated from `workspaceAnswers` (via the existing patch application flow at preview.ts:302-325+).

- [ ] **Step 1: Read the preview route patch-application site**

Open `src/routes/api.projects.preview.ts` around lines 302-340 and 430-460. Identify exactly where `workspaceAnswerPatch` is merged into `currentBrief` and persisted to the chat row. If the merge is a `{ ...currentBrief, ...workspaceAnswerPatch }` spread, `businessImages` already merges. If it's a selective merge, add `businessImages` to it.

- [ ] **Step 2: Write a failing integration-style unit test**

In `src/routes/-api.projects.preview.discuss.test.ts` (follow existing test harness), POST a discuss turn with `workspaceAnswers` containing an `image_upload` answer with `assetIds: ["a1"]` and assert the persisted brief includes `businessImages` with `a1`.

- [ ] **Step 3: Run to confirm fail**

Run: `bunx vitest run --project unit src/routes/-api.projects.preview.discuss.test.ts`
Expected: FAIL (businessImages not persisted).

- [ ] **Step 4: Implement the wiring**

Merge `businessImages` from `workspaceAnswerPatch` into the persisted brief. If `mediaPaths` in the body is a separate concern (first-turn images), add a small normalization that maps `body.mediaPaths` (`/media/<id>`) into `businessImages` on the initial patch too, so composer-attached images persist. Keep it minimal and consistent.

- [ ] **Step 5: Run to confirm pass**

Run: `bunx vitest run --project unit src/routes/-api.projects.preview.discuss.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/api.projects.preview.ts src/components/projects/WorkspaceShell.tsx src/routes/-api.projects.preview.discuss.test.ts
git commit -m "feat(preview): persist image-upload answers as businessImages for build placement"
```

---

### Task 7: Docs + full gate

**Files:**
- Modify: `AGENTS.md` (generation engine note: new image card, businessImages field)
- Modify: `DEV.md` (if behavior/setup changed)
- Create: `docs/superpowers/specs/2026-08-05-discuss-hedge-fairness-image-card-design.md`

- [ ] **Step 1: Write the design spec** capturing the three subsystems and the placement chain (concise, references files).

- [ ] **Step 2: Update AGENTS.md** — mention the `image_upload` card, `businessImages` brief field, per-model hedge energy pricing.

- [ ] **Step 3: Run the full manual gate**

Run: `bun run check`
Expected: PASS (format/lint/typecheck/affected tests/Knip).

- [ ] **Step 4: Fix any failures** and re-run until green.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md DEV.md docs/superpowers/specs/2026-08-05-discuss-hedge-fairness-image-card-design.md
git commit -m "docs: document hedge fairness + image_upload card"
```

---

## Self-Review

**Spec coverage:**
- A (per-model energy): Task 1 ✓
- B1 (placeholder backfill + prompt harden): Task 2 ✓
- image_upload card type/schema/normalize: Task 3 ✓
- image_upload card UI (single/multiple/optional/skip): Task 4 ✓
- persist businessImages + feed build (real placement): Task 5 ✓
- close client→server upload wiring (mediaPaths gap): Task 6 ✓
- image-only (jpeg/png/webp, ≤5MB, consistent): reuse uploadTempImage/accept attr — Task 4 ✓
- optional/skippable on every card: `required !== true` gate — Tasks 3,4 ✓
- purpose exposed to AI within allowlist: Task 3 (schema + prompt) ✓
- docs: Task 7 ✓
- atomic commits per task, push-main at end ✓

**Placeholder scan:** All steps carry real code or explicit instructions. The two "match existing mock style" notes defer only to reading an existing test file (not invention). No TBD/TODO.

**Type consistency:** `ImageUploadPurpose`, `BusinessImageRef`, `ImageUploadCard`, `ImageUploadQuestion`, `EnergyUsageLeg`, `addEnergyUsageLegs`, `ensureQuestionCardRichness`, `createImageUploadCard`, `ImageUploadComposer` — all named consistently across tasks. `ImageUploadPurpose` is defined in brief.ts (avoiding an import cycle with brief-flow.ts) and reused everywhere.

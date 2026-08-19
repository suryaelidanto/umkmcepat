# Per-Step Energy Metering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Charge energy after every AI step instead of once per turn, halt loops at zero balance, and bill three call sites that currently burn tokens for free.

**Architecture:** A `StepCharger` object wraps the existing `addEnergyUsage` and is wired into the ai-sdk `onStepFinish` hook at each agent call site. Because `ToolLoopAgent.generate` delegates to `generateText`, `onStepFinish` fires once per tool-loop step with that step's own usage — no plumbing through tool return contracts. The same charger exposes an `isExhausted()` predicate that feeds `stopWhen`, so a loop halts the moment balance reaches zero. Per-turn charging is deleted where per-step charging replaces it.

**Tech Stack:** TypeScript, Bun, Prisma + Postgres, ai-sdk v7 (`ai@^7.0.28`), Vitest, TanStack Start.

## Global Constraints

- Bun only. Never `npm`/`yarn`/`pnpm`. `bun.lock` is canonical.
- Work on branch `dev`. Commit each task as it completes (atomic commits).
- User-facing product UI copy is **Indonesian**. Developer-facing code, logs, errors, and docs are **English**.
- Energy = USD cost × 1,000,000 (micro-USD). Never change the formula, the 250,000 daily limit, the free/premium split, or the WIB (UTC+7) day boundary.
- `UserCredit.reason` is `VarChar(64)`. Allowed values: `build:step`, `build:subagent`, `build:spec`, `build:repair`, `discuss:step`, `discuss:repair`, `edit:step`, `moderation`. Premium rows keep the existing `" (Premium)"` suffix appended by `addEnergyUsage`.
- `UserCredit.projectId` is nullable with `onDelete: SetNull`. Never `Cascade` — deleting a project must not erase billing history.
- Energy charging must never throw into a request path. Log and continue.
- Do not run `bun run build`. Use `bun run check` before handoff.
- Run tests with `bun run test` (`vitest run --project unit`). Single file: `bun run test src/lib/path/file.test.ts`.
- Surgical edits only. Do not refactor adjacent code.

---

## File Structure

**Create:**
- `src/lib/projects/energy-step-charger.ts` — the `StepCharger` factory. Sole owner of per-step charge + exhaustion state.
- `src/lib/projects/energy-step-charger.test.ts` — unit tests for the charger.
- `prisma/migrations/20260726000000_add_user_credit_project_id/migration.sql`
- `src/routes/api.user.energy-ledger.ts` — itemized ledger API.
- `src/components/common/EnergyLedger.tsx` — itemized ledger UI.
- `src/components/common/EnergyLedger.stories.tsx` — Storybook entry (required by repo rules for new reusable UI).

**Modify:**
- `prisma/schema.prisma:349-363` — `UserCredit` gains `projectId`, relation, two indexes.
- `src/lib/user-credits.ts` — add `chargeEnergyForStep`.
- `src/lib/projects/custom-source-generator.ts` — accept a charger; wire `onStepFinish` + `stopWhen` on the main agent, the forced-rewrite pass, and `runSubagent`.
- `src/routes/api.projects.$id.generate.ts` — construct charger, thread it in, delete the now-duplicate `build:source` charge, surface `energy_exhausted`.
- `src/lib/projects/source-edit-agent.ts` — accept a charger, wire `onStepFinish`.
- `src/routes/api.projects.$id.edit.ts` — construct charger, delete duplicate charge.
- `src/lib/projects/discuss-turn-shared.ts:245` — charge `repairToolCallInTurn` directly.
- `src/routes/api.projects.preview.ts:514-590` — charge the manual card-repair branch.
- `src/components/common/EnergyDisplay.tsx` — live updates.
- `docs/architecture.md:50`, `PRODUCT.md` — doc updates.

---

## Phase 1 — Foundation

### Task 1: Schema — `UserCredit.projectId`

**Files:**
- Modify: `prisma/schema.prisma:349-363`
- Create: `prisma/migrations/20260726000000_add_user_credit_project_id/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `UserCredit.projectId: String | null`; indexes `(userId, expiresAt, createdAt)` and `(projectId, createdAt)`.

- [ ] **Step 1: Edit the model**

In `prisma/schema.prisma`, replace the `UserCredit` model body's index block and add the relation fields:

```prisma
model UserCredit {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  projectId    String?
  project      Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)
  amount       Int
  inputTokens  Int      @default(0)
  outputTokens Int      @default(0)
  reason       String   @db.VarChar(64)
  expiresAt    DateTime
  createdAt    DateTime @default(now())

  @@index([userId, expiresAt])
  @@index([userId, expiresAt, createdAt])
  @@index([projectId, createdAt])
  @@index([expiresAt])
}
```

- [ ] **Step 2: Add the back-relation on `Project`**

Prisma requires the opposite side. In the `Project` model, add:

```prisma
  userCredits UserCredit[]
```

- [ ] **Step 3: Write the migration**

Create `prisma/migrations/20260726000000_add_user_credit_project_id/migration.sql`:

```sql
ALTER TABLE "UserCredit" ADD COLUMN "projectId" TEXT;

ALTER TABLE "UserCredit"
  ADD CONSTRAINT "UserCredit_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "UserCredit_userId_expiresAt_createdAt_idx"
  ON "UserCredit"("userId", "expiresAt", "createdAt");

CREATE INDEX "UserCredit_projectId_createdAt_idx"
  ON "UserCredit"("projectId", "createdAt");
```

- [ ] **Step 4: Apply and verify**

Run: `bun run db:migrate`
Expected: migration applies cleanly; no drift warning.

Then run: `bun run typecheck`
Expected: PASS (Prisma client regenerated with the new field).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260726000000_add_user_credit_project_id
git commit -m "feat(energy): add nullable projectId to UserCredit ledger"
```

---

### Task 2: `chargeEnergyForStep`

**Files:**
- Modify: `src/lib/user-credits.ts` (add after `chargeEnergyForAiUsage`, ~line 211)
- Modify: `src/lib/user-credits.test.ts`

**Interfaces:**
- Consumes: `addEnergyUsage`, `getRemainingEnergy` from `src/lib/user-credits.ts`.
- Produces:
  ```ts
  chargeEnergyForStep(opts: {
    userId: string;
    modelId?: string | null;
    inputTokens: number;
    outputTokens: number;
    reason: string;
    projectId?: string | null;
  }): Promise<{ energyUsed: number; remaining: number } | null>
  ```
  Returns `null` when usage is zero or the charge throws.

**Note:** `addEnergyUsage` must also accept and persist `projectId`. Its signature becomes positional-plus-options to avoid breaking existing callers.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/user-credits.test.ts`. Add `chargeEnergyForStep` to the existing import block from `./user-credits` first.

```ts
describe("chargeEnergyForStep", () => {
  beforeEach(() => {
    getModelPricingMock.mockReset();
    getModelPricingMock.mockResolvedValue({
      promptPrice: 0.0000003,
      completionPrice: 0.0000012,
    });
    prismaQueryRawMock.mockReset();
    prismaExecuteRawMock.mockReset();
    prismaExecuteRawMock.mockResolvedValue(1);
  });

  it("returns null and writes nothing when usage is zero", async () => {
    const result = await chargeEnergyForStep({
      userId: "u1",
      modelId: "m1",
      inputTokens: 0,
      outputTokens: 0,
      reason: "build:step",
    });

    expect(result).toBeNull();
    expect(prismaExecuteRawMock).not.toHaveBeenCalled();
  });

  it("charges and reports remaining balance", async () => {
    // First query: free energy used today. Later queries: balance stats.
    prismaQueryRawMock.mockResolvedValue([{ used: 0 }]);

    const result = await chargeEnergyForStep({
      userId: "u1",
      modelId: "m1",
      inputTokens: 1_000_000,
      outputTokens: 0,
      reason: "build:step",
      projectId: "p1",
    });

    // 1e6 input tokens * $0.0000003 = $0.30 -> 300_000 energy
    expect(result?.energyUsed).toBe(300_000);
    expect(typeof result?.remaining).toBe("number");
    expect(prismaExecuteRawMock).toHaveBeenCalled();
  });

  it("returns null instead of throwing when the ledger write fails", async () => {
    prismaQueryRawMock.mockResolvedValue([{ used: 0 }]);
    prismaExecuteRawMock.mockRejectedValue(new Error("db down"));

    const result = await chargeEnergyForStep({
      userId: "u1",
      modelId: "m1",
      inputTokens: 1000,
      outputTokens: 1000,
      reason: "build:step",
    });

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/lib/user-credits.test.ts`
Expected: FAIL — `chargeEnergyForStep is not a function` / import error.

- [ ] **Step 3: Thread `projectId` through `addEnergyUsage`**

In `src/lib/user-credits.ts`, change the signature to accept an optional trailing options object and include the column in both INSERTs:

```ts
export async function addEnergyUsage(
  userId: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  reason: string,
  options: { projectId?: string | null } = {},
): Promise<{ energyUsed: number; inputTokens: number; outputTokens: number }> {
```

Inside the transaction, add `projectId` to the free-row INSERT column list and values:

```ts
      await tx.$executeRaw`
        INSERT INTO "UserCredit" ("id", "userId", "projectId", "amount", "inputTokens", "outputTokens", "reason", "expiresAt", "createdAt")
        VALUES (
          ${`c${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`},
          ${userId},
          ${options.projectId ?? null},
          ${-freeDeduction},
          ${Math.round(input * freeRatio)},
          ${Math.round(output * freeRatio)},
          ${reason.slice(0, 64)},
          ${endOfDay},
          NOW()
        )
      `;
```

Apply the identical `projectId` addition to the premium INSERT (its other values are unchanged).

- [ ] **Step 4: Add `chargeEnergyForStep`**

Append to `src/lib/user-credits.ts`:

```ts
/**
 * Per-step debit. Same accounting as `chargeEnergyForAiUsage`, but also
 * reports the post-charge balance so agent loops can halt at zero.
 * Never throws into the request path.
 */
export async function chargeEnergyForStep(opts: {
  userId: string;
  modelId?: string | null;
  inputTokens: number;
  outputTokens: number;
  reason: string;
  projectId?: string | null;
}): Promise<{ energyUsed: number; remaining: number } | null> {
  const input = Math.max(0, Math.floor(opts.inputTokens));
  const output = Math.max(0, Math.floor(opts.outputTokens));
  if (input <= 0 && output <= 0) {
    return null;
  }

  try {
    const charged = await addEnergyUsage(
      opts.userId,
      opts.modelId?.trim() || "unknown",
      input,
      output,
      opts.reason,
      { projectId: opts.projectId ?? null },
    );
    const remaining = await getRemainingEnergy(opts.userId);
    return { energyUsed: charged.energyUsed, remaining };
  } catch (error) {
    console.warn("[energy] chargeEnergyForStep failed", {
      reason: opts.reason,
      userId: opts.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test src/lib/user-credits.test.ts`
Expected: PASS, including all pre-existing tests (the `addEnergyUsage` signature change is backward compatible).

- [ ] **Step 6: Commit**

```bash
git add src/lib/user-credits.ts src/lib/user-credits.test.ts
git commit -m "feat(energy): add chargeEnergyForStep with projectId attribution"
```

---

### Task 3: The `StepCharger`

**Files:**
- Create: `src/lib/projects/energy-step-charger.ts`
- Create: `src/lib/projects/energy-step-charger.test.ts`

**Interfaces:**
- Consumes: `chargeEnergyForStep` from Task 2.
- Produces:
  ```ts
  type StepCharger = {
    onStepFinish: (step: { usage?: { inputTokens?: number | null; outputTokens?: number | null } | null; response?: { modelId?: string } }) => Promise<void>;
    isExhausted: () => boolean;
    totals: () => { inputTokens: number; outputTokens: number; energyUsed: number };
  };

  createStepCharger(opts: {
    userId: string;
    reason: string;
    modelId: string;
    projectId?: string | null;
    onCharge?: (event: { energyUsed: number; remaining: number; reason: string }) => void;
  }): StepCharger;
  ```

The `onCharge` callback is the realtime hook — routes wire it to their existing SSE `send` or `publishProgress`. The charger itself knows nothing about transport.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/projects/energy-step-charger.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { chargeEnergyForStepMock } = vi.hoisted(() => ({
  chargeEnergyForStepMock: vi.fn(),
}));

vi.mock("@/lib/payment/user-credits", () => ({
  chargeEnergyForStep: chargeEnergyForStepMock,
}));

import { createStepCharger } from "./energy-step-charger";

const step = (inputTokens: number, outputTokens: number) => ({
  usage: { inputTokens, outputTokens },
  response: { modelId: "resolved-model" },
});

describe("createStepCharger", () => {
  beforeEach(() => {
    chargeEnergyForStepMock.mockReset();
  });

  it("charges each step and accumulates totals", async () => {
    chargeEnergyForStepMock.mockResolvedValue({
      energyUsed: 100,
      remaining: 5_000,
    });
    const charger = createStepCharger({
      userId: "u1",
      reason: "build:step",
      modelId: "fallback-model",
      projectId: "p1",
    });

    await charger.onStepFinish(step(10, 20));
    await charger.onStepFinish(step(30, 40));

    expect(chargeEnergyForStepMock).toHaveBeenCalledTimes(2);
    expect(charger.totals()).toEqual({
      inputTokens: 40,
      outputTokens: 60,
      energyUsed: 200,
    });
    expect(charger.isExhausted()).toBe(false);
  });

  it("prefers the model id reported by the response over the fallback", async () => {
    chargeEnergyForStepMock.mockResolvedValue({ energyUsed: 1, remaining: 1 });
    const charger = createStepCharger({
      userId: "u1",
      reason: "build:step",
      modelId: "fallback-model",
    });

    await charger.onStepFinish(step(10, 10));

    expect(chargeEnergyForStepMock.mock.calls[0][0].modelId).toBe(
      "resolved-model",
    );
  });

  it("becomes exhausted when remaining hits zero", async () => {
    chargeEnergyForStepMock.mockResolvedValue({
      energyUsed: 100,
      remaining: 0,
    });
    const charger = createStepCharger({
      userId: "u1",
      reason: "build:step",
      modelId: "m",
    });

    expect(charger.isExhausted()).toBe(false);
    await charger.onStepFinish(step(10, 10));
    expect(charger.isExhausted()).toBe(true);
  });

  it("stays exhausted once tripped, even if a later charge reports credit", async () => {
    const charger = createStepCharger({
      userId: "u1",
      reason: "build:step",
      modelId: "m",
    });

    chargeEnergyForStepMock.mockResolvedValue({ energyUsed: 1, remaining: 0 });
    await charger.onStepFinish(step(1, 1));
    chargeEnergyForStepMock.mockResolvedValue({
      energyUsed: 1,
      remaining: 999,
    });
    await charger.onStepFinish(step(1, 1));

    expect(charger.isExhausted()).toBe(true);
  });

  it("ignores steps with no usage", async () => {
    const charger = createStepCharger({
      userId: "u1",
      reason: "build:step",
      modelId: "m",
    });

    await charger.onStepFinish({ usage: null });

    expect(chargeEnergyForStepMock).not.toHaveBeenCalled();
    expect(charger.totals().energyUsed).toBe(0);
  });

  it("emits an onCharge event per charged step", async () => {
    chargeEnergyForStepMock.mockResolvedValue({
      energyUsed: 42,
      remaining: 7,
    });
    const onCharge = vi.fn();
    const charger = createStepCharger({
      userId: "u1",
      reason: "build:step",
      modelId: "m",
      onCharge,
    });

    await charger.onStepFinish(step(5, 5));

    expect(onCharge).toHaveBeenCalledWith({
      energyUsed: 42,
      remaining: 7,
      reason: "build:step",
    });
  });

  it("does not throw when the charge fails", async () => {
    chargeEnergyForStepMock.mockResolvedValue(null);
    const charger = createStepCharger({
      userId: "u1",
      reason: "build:step",
      modelId: "m",
    });

    await expect(charger.onStepFinish(step(5, 5))).resolves.toBeUndefined();
    expect(charger.isExhausted()).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/lib/projects/energy-step-charger.test.ts`
Expected: FAIL — cannot resolve `./energy-step-charger`.

- [ ] **Step 3: Implement the charger**

Create `src/lib/projects/energy-step-charger.ts`:

```ts
import { chargeEnergyForStep } from "@/lib/payment/user-credits";

export type StepChargeEvent = {
  energyUsed: number;
  remaining: number;
  reason: string;
};

type StepLike = {
  usage?: { inputTokens?: number | null; outputTokens?: number | null } | null;
  response?: { modelId?: string };
};

export type StepCharger = {
  onStepFinish: (step: StepLike) => Promise<void>;
  isExhausted: () => boolean;
  totals: () => {
    inputTokens: number;
    outputTokens: number;
    energyUsed: number;
  };
};

/**
 * Charges energy once per agent step via the ai-sdk `onStepFinish` hook.
 * `isExhausted` is latching: once the balance hits zero the loop must stop,
 * and a concurrently-granted top-up should not silently resume it.
 */
export function createStepCharger(opts: {
  userId: string;
  reason: string;
  modelId: string;
  projectId?: string | null;
  onCharge?: (event: StepChargeEvent) => void;
}): StepCharger {
  let inputTokens = 0;
  let outputTokens = 0;
  let energyUsed = 0;
  let exhausted = false;

  return {
    isExhausted: () => exhausted,
    totals: () => ({ inputTokens, outputTokens, energyUsed }),
    async onStepFinish(step) {
      const input = Math.max(0, Math.floor(step?.usage?.inputTokens ?? 0));
      const output = Math.max(0, Math.floor(step?.usage?.outputTokens ?? 0));
      if (input <= 0 && output <= 0) {
        return;
      }

      inputTokens += input;
      outputTokens += output;

      const charged = await chargeEnergyForStep({
        userId: opts.userId,
        modelId: step?.response?.modelId || opts.modelId,
        inputTokens: input,
        outputTokens: output,
        reason: opts.reason,
        projectId: opts.projectId ?? null,
      });

      if (!charged) {
        return;
      }

      energyUsed += charged.energyUsed;
      if (charged.remaining <= 0) {
        exhausted = true;
      }
      opts.onCharge?.({
        energyUsed: charged.energyUsed,
        remaining: charged.remaining,
        reason: opts.reason,
      });
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/lib/projects/energy-step-charger.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/energy-step-charger.ts src/lib/projects/energy-step-charger.test.ts
git commit -m "feat(energy): add per-step charger with latching exhaustion"
```

---

### Task 4: Wire the build + repair agents (and delete the duplicate charge)

**Files:**
- Modify: `src/lib/projects/custom-source-generator.ts:58-75` (params), `:161-199` (main agent), `:339-375` (forced rewrite), `:2105-2160` (`repairGeneratedProjectFiles`), `:2238-2295` (`repairRuntimeErrors`)
- Modify: `src/routes/api.projects.$id.generate.ts:326-356` (flush), `:472` and `:979` (repair call sites), `:829` (call site)
- Modify: `src/lib/projects/runtime-self-heal.ts:106` (passes `repairRuntimeErrors` args)

**Interfaces:**
- Consumes: `createStepCharger`, `StepCharger` from Task 3.
- Produces: `generateCustomProjectFilesWithAgent`, `repairGeneratedProjectFiles`, and `repairRuntimeErrors` each accept `stepCharger?: StepCharger`; each result gains `energyExhausted: boolean`.

> **Double-charge hazard — read before editing.** `flushGenerateEnergy` in `generate.ts:333` charges `build:source` from the generator's returned usage. The repair functions at `:472` and `:979` feed the **same** `sourceInputTokens` accumulator. So `build:source` currently bills BOTH the initial generation AND every build/runtime repair pass. Once `onStepFinish` charges each agent's own steps, that single path must be deleted or **all** of them double-charge. And conversely: if you delete it without wiring `onStepFinish` into the two repair agents, the repair passes go unbilled — you'd swap one leak for a worse one. Wire all three agents (main, `repairGeneratedProjectFiles`, `repairRuntimeErrors`) in this task, then delete `flushGenerateEnergy`'s source branch. The `build:spec` charge stays — the spec call is a separate `generateText`, not step-charged here.

- [ ] **Step 1: Accept the charger in all three generator functions**

In `src/lib/projects/custom-source-generator.ts`, add the import:

```ts
import { type StepCharger } from "@/lib/projects/energy-step-charger";
```

Extend the destructured params and their type in `generateCustomProjectFilesWithAgent`, `repairGeneratedProjectFiles` (`:2105`), and `repairRuntimeErrors` (`:2238`) — all three gain the same optional field:

```ts
export async function generateCustomProjectFilesWithAgent({
  implementationBrief,
  onOperation,
  projectId,
  implementationSpec,
  schema,
  onFilesChanged,
  abortSignal,
  stepCharger,
}: {
  implementationBrief?: string;
  implementationSpec?: ImplementationSpec;
  onOperation?: (operation: GeneratedAppAgentOperation) => void;
  projectId: string;
  schema: ProjectSiteSchema;
  onFilesChanged?: (files: GeneratedProjectFile[]) => void;
  abortSignal?: AbortSignal;
  stepCharger?: StepCharger;
}): Promise<CustomGeneratedSourceResult> {
```

- [ ] **Step 2: Wire `onStepFinish` and `stopWhen` on the main agent**

At `custom-source-generator.ts:163`, the `ToolLoopAgent` construction gains two changes. Replace the existing `stopWhen: isStepCount(generateSteps),` line and add the hook:

```ts
    const agent = new ToolLoopAgent({
      model: getAiModel(getGenerationModel()),
      // Reasoning models emit hidden reasoning_content per step; without a
      // generous per-step budget the visible tool-call never lands.
      maxOutputTokens: 12_000,
      instructions: buildGeneratedAppAgentInstructions(
        schema,
        implementationSpec,
        "generate",
      ),
      telemetry: getAiTelemetry("project-source-generation-agent", {
        projectId,
      }),
      onStepFinish: stepCharger?.onStepFinish,
      // Step cap is a brake only — outcome still comes from quality checklist.
      // Energy exhaustion is a hard stop: the user has nothing left to spend.
      stopWhen: [
        isStepCount(generateSteps),
        () => stepCharger?.isExhausted() ?? false,
      ],
      tools: createAgentTools(runCommand, projectId),
    });
```

- [ ] **Step 3: Report exhaustion in the result**

`CustomGeneratedSourceResult` gains a field. Find its type declaration and add:

```ts
  energyExhausted: boolean;
```

Then in the success return block at `custom-source-generator.ts:~300`, add alongside `usage`:

```ts
      energyExhausted: stepCharger?.isExhausted() ?? false,
```

- [ ] **Step 4: Wire the forced-rewrite pass and the two repair agents**

`runForcedRewritePass` (`:339`) is an internal function that constructs its own `ToolLoopAgent`. Add `stepCharger?: StepCharger` to its params and give its agent the same two options, replacing `stopWhen: isStepCount(rewriteSteps),`:

```ts
      onStepFinish: stepCharger?.onStepFinish,
      stopWhen: [
        isStepCount(rewriteSteps),
        () => stepCharger?.isExhausted() ?? false,
      ],
```

At its call site (`custom-source-generator.ts:242`), guard the invocation:

```ts
    if (!stepCharger?.isExhausted()) {
      // existing runForcedRewritePass(...) call, now also passing stepCharger
    }
```

Apply the identical `onStepFinish` + `stopWhen` change to the `ToolLoopAgent` inside `repairGeneratedProjectFiles` (`:2145`, replacing `stopWhen: isStepCount(repairSteps),`) and `repairRuntimeErrors` (`:2281`, replacing its `stopWhen: isStepCount(repairSteps),`). Both already have `repairSteps` in scope.

- [ ] **Step 5: Construct the charger, wire all three call sites, delete the duplicate charge**

In `src/routes/api.projects.$id.generate.ts`, add the import:

```ts
import { createStepCharger } from "@/lib/projects/energy-step-charger";
```

Construct **one** charger before the generation call at `:829` and reuse it for every downstream agent in the same build so their totals accumulate together:

```ts
        const sourceStepCharger = createStepCharger({
          userId,
          projectId,
          reason: "build:step",
          modelId: getGenerationModel(),
          onCharge(event) {
            send("energy", event);
          },
        });
```

Pass `stepCharger: sourceStepCharger` into all three call sites: the generation at `:829`, and the two repair passes at `:472` and `:979`. The runtime-self-heal path calls `repairRuntimeErrors` through `src/lib/projects/runtime-self-heal.ts:106`; thread the same charger (or construct a sibling with `reason: "build:repair"`) into it so runtime repairs also bill.

Then delete the now-duplicate per-turn charge. Remove the `sourceInputTokens`, `sourceOutputTokens`, and `sourceModelId` declarations (`:330-332`), the entire `if (sourceInputTokens > 0 || sourceOutputTokens > 0) { ... }` block inside `flushGenerateEnergy` (`:347-355`), and the three accumulator assignments at `:481-482,483-485,989-993`. `flushGenerateEnergy` keeps only the `build:spec` charge.

Pass `stepCharger: sourceStepCharger` into the generation call:

```ts
        const sourceGeneration = await generateCustomProjectFilesWithAgent({
          implementationBrief: buildPrompt,
          implementationSpec,
          stepCharger: sourceStepCharger,
          onOperation(operation) {
            send("operation", operation);
          },
          // ...remaining existing properties unchanged
        });
```

- [ ] **Step 6: Verify no double-charge remains**

Run: `grep -n "build:source" src/routes/api.projects.\$id.generate.ts`
Expected: **no output.** If any line prints, the duplicate charge still exists — delete it.

- [ ] **Step 7: Run the affected tests**

Run: `bun run test tests/routes/projects.id.generate.test.ts src/lib/user-credits.test.ts`
Expected: PASS. If a test asserts a `build:source` charge, update it to assert `build:step` rows instead — the reason string changed by design.

- [ ] **Step 8: Typecheck and commit**

Run: `bun run typecheck`
Expected: PASS.

```bash
git add src/lib/projects/custom-source-generator.ts src/routes/api.projects.\$id.generate.ts tests/routes/projects.id.generate.test.ts
git commit -m "feat(energy): charge build agent per step, drop per-turn source charge"
```

---

## Phase 2 — Stop at zero

### Task 5: Surface `energy_exhausted` to the user

**Files:**
- Modify: `src/routes/api.projects.$id.generate.ts` (after the generation call)
- Modify: the build-progress UI component that renders build failures

**Interfaces:**
- Consumes: `sourceGeneration.energyExhausted` from Task 4.
- Produces: SSE event `energy_exhausted` carrying `{ message: string }`.

- [ ] **Step 1: Emit the event**

Immediately after the `generateCustomProjectFilesWithAgent` call returns in `generate.ts`, before the build/repair passes:

```ts
        if (sourceGeneration.energyExhausted) {
          send("energy_exhausted", {
            message:
              "Energi kamu habis di tengah proses. File yang sudah dibuat tetap tersimpan — isi ulang energi untuk melanjutkan.",
          });
        }
```

The copy is Indonesian (user-facing). Partial files persist because the agent writes through `runCommand` into the project directory as it goes.

- [ ] **Step 2: Skip repair passes when exhausted**

The two build-repair passes (`generate.ts:475` and `:979`) each call `repairGeneratedProjectFiles`, which spends more energy. Guard both with the same condition:

```ts
        if (!sourceGeneration.energyExhausted) {
          // existing repair-pass block unchanged
        }
```

- [ ] **Step 3: Render it in the UI**

In the component consuming the build SSE stream, handle the `energy_exhausted` event by showing the message as an informational state (not an error state) alongside the existing top-up call-to-action used by `EnergyBoosterModal`.

- [ ] **Step 4: Verify manually**

Set a test user's balance near zero, start a build, and confirm: the loop halts, the Indonesian message renders, generated files remain on disk, and the balance is at or just below zero — never deeply negative.

- [ ] **Step 5: Run checks and commit**

Run: `bun run check`
Expected: PASS.

```bash
git add -A
git commit -m "feat(energy): halt build at zero energy and keep partial work"
```

---

## Phase 3 — Remaining call sites, leaks, and ledger

### Task 6: Sub-agent charging

**Files:**
- Modify: `src/lib/projects/custom-source-generator.ts:505-552` (`runSubagent`), `:440-449` (`spawn_subagent` tool), `:420` (`createAgentTools`)

**Interfaces:**
- Consumes: `StepCharger` type from Task 3, `createStepCharger`.
- Produces: sub-agent steps write `build:subagent` ledger rows.

This closes the largest leak. The sub-agent charges itself — no change to the tool's `string` return contract.

- [ ] **Step 1: Accept charger context in `runSubagent`**

Add a parameter to `runSubagent`'s destructured params and its type:

```ts
  subagentCharger,
}: {
  goal: string;
  projectId: string;
  readOnlyTools: ReturnType<typeof createReadOnlyAgentTools>;
  subagentCharger?: StepCharger;
}): Promise<string> {
```

- [ ] **Step 2: Wire the hook**

In the `ToolLoopAgent` inside `runSubagent`, replace `stopWhen: isStepCount(subagentSteps),` with:

```ts
      onStepFinish: subagentCharger?.onStepFinish,
      stopWhen: [
        isStepCount(subagentSteps),
        () => subagentCharger?.isExhausted() ?? false,
      ],
```

- [ ] **Step 3: Pass the parent charger into `createAgentTools`**

`createAgentTools(runCommand, projectId)` at `:420` constructs the `spawn_subagent` tool. Add an optional `subagentCharger?: StepCharger` param:

```ts
function createAgentTools(
  runCommand: RunCommand,
  projectId: string,
  subagentCharger?: StepCharger,
) {
```

Inside the `spawn_subagent` tool's execute (`:444`), construct a dedicated sub-agent charger so its rows are attributable separately, then pass it through:

```ts
      execute: async ({ goal }: { goal: string }) => {
        const charger = subagentCharger
          ? createStepCharger({
              userId: subagentCharger.userId,
              projectId,
              reason: "build:subagent",
              modelId: subagentCharger.modelId,
              onCharge: subagentCharger.onCharge,
            })
          : undefined;
        return runSubagent({ goal, projectId, readOnlyTools, subagentCharger: charger });
      },
```

This needs `StepCharger` to expose `userId`, `modelId`, and `onCharge` for forwarding. Add those as public readonly fields on the `StepCharger` type in Task 3 — alongside `onStepFinish`/`isExhausted`/`totals`:

```ts
export type StepCharger = {
  readonly userId: string;
  readonly modelId: string;
  readonly onCharge?: (event: StepChargeEvent) => void;
  onStepFinish: (step: StepLike) => Promise<void>;
  isExhausted: () => boolean;
  totals: () => { inputTokens: number; outputTokens: number; energyUsed: number };
};
```

Add the corresponding `userId`/`modelId`/`onCharge` fields to the returned object in `createStepCharger`'s implementation. Update Task 3's tests to assert `charger.userId` and `charger.modelId` equal the opts passed in.

Import `createStepCharger` at the top of `custom-source-generator.ts`.

- [ ] **Step 4: Forward the charger at every `createAgentTools` call site**

There are four call sites: `:178` (main agent), `:369` (forced rewrite), `:2159` (`repairGeneratedProjectFiles`), `:2291` (`repairRuntimeErrors`). All four now accept a `stepCharger` (from Task 4) — pass it as the third arg at each:

```ts
      tools: createAgentTools(runCommand, projectId, stepCharger),
```

No route change needed: `generate.ts` already constructs and passes `sourceStepCharger` (Task 4 Step 5), and it flows down through all four.

- [ ] **Step 5: Verify with a real build**

Trigger a build whose prompt provokes a `spawn_subagent` call, then query:

```bash
psql "$DATABASE_URL" -c "SELECT reason, count(*), sum(amount) FROM \"UserCredit\" WHERE reason LIKE 'build:%' GROUP BY reason;"
```

Expected: a `build:subagent` row group exists with a negative sum.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects/custom-source-generator.ts src/routes/api.projects.\$id.generate.ts
git commit -m "fix(energy): bill sub-agent tool loops that previously ran free"
```

---

### Task 7: Edit agent per-step charging

**Files:**
- Modify: `src/lib/projects/source-edit-agent.ts:64-171`
- Modify: `src/routes/api.projects.$id.edit.ts:441,463,500,565,581`

**Interfaces:**
- Consumes: `createStepCharger`.
- Produces: `edit:step` ledger rows; the `edit_turn` per-turn charge is removed.

- [ ] **Step 1: Accept and wire the charger**

Add `stepCharger?: StepCharger` to `editGeneratedSourceWithAgent`'s destructured params and its type. Import the type:

```ts
import { type StepCharger } from "@/lib/projects/energy-step-charger";
```

On its `ToolLoopAgent` (`source-edit-agent.ts:64`), replace `stopWhen: isStepCount(18),` with:

```ts
      onStepFinish: stepCharger?.onStepFinish,
      stopWhen: [isStepCount(18), () => stepCharger?.isExhausted() ?? false],
```

- [ ] **Step 2: Construct in the route and delete the duplicate**

In `api.projects.$id.edit.ts`, build the charger with `reason: "edit:step"` before the first `editGeneratedSourceWithAgent` call and pass it in. Then delete the entire `flushEditEnergy` function (`:431-441`, the `chargeEnergyForAiUsage({ ..., reason: "edit_turn" })` call) and the usage accumulators feeding it (`totalEditInputTokens`/`totalEditOutputTokens`/`editModelId` at `:428-430`, plus their `+=` assignments after each `editGeneratedSourceWithAgent` and fallback call).

The fallback edit (`:463`) and validation-repair pass reuse the **same** charger instance — pass `stepCharger` into both `editGeneratedSourceWithAgent` calls so their steps bill and totals accumulate together.

- [ ] **Step 3: Verify no duplicate remains**

Run: `grep -n "edit_turn" src/routes/api.projects.\$id.edit.ts`
Expected: no output.

- [ ] **Step 4: Test and commit**

Run: `bun run test && bun run typecheck`
Expected: PASS.

```bash
git add src/lib/projects/source-edit-agent.ts src/routes/api.projects.\$id.edit.ts
git commit -m "feat(energy): charge source edit agent per step"
```

---

### Task 8: Discuss-turn leaks

**Files:**
- Modify: `src/lib/projects/discuss-turn-shared.ts:245-268` (`repairToolCallInTurn`)
- Modify: `src/routes/api.projects.preview.ts:514-590` (manual card repair)

**Interfaces:**
- Consumes: `chargeEnergyForAiUsage` (already imported in the route).
- Produces: `discuss:repair` ledger rows.

Both are single `generateText` calls, not step loops — they charge directly rather than through a charger.

- [ ] **Step 1: Add `projectId` passthrough to `chargeEnergyForAiUsage`**

In `src/lib/user-credits.ts`, add `projectId?: string | null` to the `chargeEnergyForAiUsage` options type and forward it to `addEnergyUsage`'s `options` argument (mirroring `chargeEnergyForStep` from Task 2):

```ts
export async function chargeEnergyForAiUsage(opts: {
  userId: string;
  modelId?: string | null;
  inputTokens: number;
  outputTokens: number;
  reason: string;
  projectId?: string | null;
}): Promise<...> {
  // ...inside the try:
    return await addEnergyUsage(
      opts.userId,
      opts.modelId?.trim() || "unknown",
      input,
      output,
      opts.reason,
      { projectId: opts.projectId ?? null },
    );
```

- [ ] **Step 2: Charge the in-turn repair**

`repairToolCallInTurn` (`discuss-turn-shared.ts:222`) already takes `projectId` and `modelName`. Add `userId: string` to its params and type. After its `generateText` at `:245` resolves (before the `if (!repaired) return null;`), charge inline:

```ts
    void chargeEnergyForAiUsage({
      userId,
      projectId,
      modelId: modelName,
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      reason: "discuss:repair",
    });
```

`void` is deliberate — repair sits on the tool-parsing hot path and must not block it on a DB write. `chargeEnergyForAiUsage` never throws, so a dropped write logs and continues. Use `modelName` (already in scope) as the model id; `result.response?.modelId` is unavailable on this non-streaming call's type.

Update its caller in `discuss-turn-worker.ts:94` — pass `userId`, which is in scope at `:53`:

```ts
        repairToolCallInTurn({
          error,
          messages,
          model,
          modelName,
          userId,
          projectId: project.id,
          toolCall,
        }),
```

> **Scope note:** The main discuss turn (`streamText` at `discuss-turn-worker.ts:88`) stays **per-turn** charged via `primary.usage` (`:267`) — converting a streaming turn to per-step is out of scope for this plan. The two leaks fixed here are the only discuss-path charging changes.

- [ ] **Step 3: Charge the manual card-repair handler**

In `api.projects.preview.ts`, the `mode === "repair_card"` branch calls `repairDiscussCardWithTool` at `:562` and discards `turn.usage`. After the `persistProjectChatTurn` call, charge:

```ts
      await chargeEnergyForAiUsage({
        userId,
        projectId: project.id,
        modelId: modelName,
        inputTokens: turn.usage?.inputTokens ?? 0,
        outputTokens: turn.usage?.outputTokens ?? 0,
        reason: "discuss:repair",
      });
```

`turn.usage` is `{ inputTokens, outputTokens }` (confirmed: `repairDiscussCardWithTool` returns accumulated totals at `discuss-turn-shared.ts:181`) — there is no `turn.modelId`, so pass `modelName`, the discuss model the handler already resolved for the `getAiModel(modelName)` call above.

- [ ] **Step 4: Verify both paths bill**

Trigger a card repair from the workspace UI, then:

```bash
psql "$DATABASE_URL" -c "SELECT reason, sum(amount) FROM \"UserCredit\" WHERE reason LIKE 'discuss:repair%' GROUP BY reason;"
```

Expected: at least one row with a negative sum.

- [ ] **Step 5: Test and commit**

Run: `bun run test && bun run typecheck`
Expected: PASS.

```bash
git add src/lib/projects/discuss-turn-shared.ts src/lib/projects/discuss-turn-worker.ts src/routes/api.projects.preview.ts src/lib/user-credits.ts
git commit -m "fix(energy): bill in-turn tool repair and manual card repair"
```

---

### Task 9: Itemized ledger API and UI

**Files:**
- Create: `src/routes/api.user.energy-ledger.ts`
- Create: `src/components/common/EnergyLedger.tsx`
- Create: `src/components/common/EnergyLedger.stories.tsx`
- Modify: `src/components/common/EnergyDisplay.tsx`

**Interfaces:**
- Consumes: `UserCredit` rows with `projectId` (Task 1), the `energy` SSE event (Task 4).
- Produces: `GET /api/user/energy-ledger?projectId=<id>&limit=<n>` returning `{ entries: Array<{ id, createdAt, reason, inputTokens, outputTokens, amount, projectId }> }`.

- [ ] **Step 1: Build the API route**

Follow the auth and response conventions in the existing `src/routes/api.user.credits.ts`. Query the authenticated user's `UserCredit` rows where `amount < 0` (spend rows only — grants are not usage), newest first, `take: limit` clamped to 200, optionally filtered by `projectId`. Never accept a `userId` from the client; read it from the session.

- [ ] **Step 2: Build the ledger component**

`EnergyLedger.tsx` renders rows: timestamp, a human label derived from `reason`, model tokens in/out, and energy spent as `Math.abs(amount)`. Reason labels are Indonesian (user-facing), e.g. `build:step` → "Langkah build", `build:subagent` → "Riset sub-agen", `discuss:repair` → "Perbaikan kartu", `moderation` → "Moderasi". Follow `DESIGN.md` and existing `src/components/common` patterns.

- [ ] **Step 3: Add the Storybook entry**

Repo rules require new reusable UI in Storybook in the same change. Cover: populated list, empty state, and a build that ended in exhaustion.

- [ ] **Step 4: Make `EnergyDisplay` live**

Subscribe to the `energy` SSE event emitted by the charger's `onCharge` (Task 4) and update the displayed remaining balance from `event.remaining`. Also invalidate `queryKeys.energy` so any cached balance elsewhere refreshes.

- [ ] **Step 5: Verify**

Run: `bun run test:storybook`
Expected: PASS.

Then start a build and watch the meter decrement during the run rather than only at the end.

- [ ] **Step 6: Commit**

```bash
git add src/routes/api.user.energy-ledger.ts src/components/common/EnergyLedger.tsx src/components/common/EnergyLedger.stories.tsx src/components/common/EnergyDisplay.tsx
git commit -m "feat(energy): add itemized ledger and live-updating energy meter"
```

---

### Task 10: Docs and full gate

**Files:**
- Modify: `docs/architecture.md:50`
- Modify: `PRODUCT.md` (energy section)

- [ ] **Step 1: Rewrite the architecture line**

`docs/architecture.md:50` currently reads "Energy is charged for the full turn even on disconnect." Replace with:

```markdown
Energy is charged per agent step as work completes, so a disconnected or
halted turn is billed only for the steps that actually ran. When a balance
reaches zero mid-run the loop stops and already-written files are kept.
```

- [ ] **Step 2: Update `PRODUCT.md`**

Add one line to the energy section noting that users can see an itemized per-step ledger of what each build spent.

- [ ] **Step 3: Run the full gate**

Run: `bun run verify`
Expected: PASS — format, lint, typecheck, full unit tests, Knip.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture.md PRODUCT.md
git commit -m "docs(energy): describe per-step charging and itemized ledger"
```

---

## Verification Checklist

After all tasks, confirm against the spec:

- [ ] No `chargeEnergyForAiUsage` call charges tokens that `onStepFinish` also charges (grep for `build:source`, `edit_turn` — both must be gone).
- [ ] `build:subagent` rows appear for builds that spawn sub-agents.
- [ ] `discuss:repair` rows appear for in-turn repairs and manual card repairs.
- [ ] A build that exhausts energy halts, keeps its files, and leaves the balance at or just below zero.
- [ ] The energy meter visibly decrements during a build.
- [ ] The ledger lists individual steps with model, tokens, and energy.
- [ ] `bun run verify` passes.

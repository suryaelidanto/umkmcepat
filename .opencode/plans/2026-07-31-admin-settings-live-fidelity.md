# Admin Settings Live Fidelity + Booster Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Product knobs and booster pricing on `/admin/settings` are the real source of truth end-to-end: save sticks without restart, server enforces DB values, booster UI shows the same amounts/energy as payment create.

**Architecture:** (1) Admin PUT always `invalidateSettingCache` + `await primeSettingCache` so `getSettingSync` consumers see DB immediately. (2) Public/authenticated `GET` packs API resolves all boosters via existing `getBoosterPack` (DB-first). (3) `EnergyBoosterModal` loads packs from that API; hardcoded `BOOSTER_PACKS` remains fallback defaults only. (4) Small honesty fix for `runtime.max_containers` + drop false `requiresRestart` on live-read keys.

**Tech Stack:** Existing `app-settings`, `getBoosterPack` / `BOOSTER_PACKS`, TanStack route handlers, React Query, Vitest.

**Sequencing:** This is **Slice 1**. Slice 2 = attempt queue (`.opencode/plans/2026-07-31-build-attempt-queue.md`). After Slice 1 ships, queue plan Task 1 (re-prime / drop requiresRestart on build concurrency) is already done — skip or no-op those steps in Slice 2.

## Global Constraints

- Resolution order: **DB → env → code fallback** (never reverse)
- Secrets / topology / `ADMIN_EMAILS` / allowlists / `NEXT_PUBLIC_*` stay env-only
- User-facing copy Indonesian; code/docs English
- No secrets in tracked files
- Payment create already uses `getBoosterPack`; webhook uses snapshotted `payment.amount` / `energyGranted` — **do not** re-price mid-flight
- Marketing copy (`PAKET_DETAILS` labels) may stay code; only **amount + energy** must follow admin
- Gimmick strikethrough (`getGimmickCoret`) may stay client-derived from displayed amount; do not invent new admin keys for gimmick unless needed
- Bun only; surgical diffs; TDD

---

### Task 1: Re-prime snapshot on admin PUT

**Files:**

- Modify: `src/routes/api.admin.settings.ts` (~140)
- Modify: `src/lib/app-settings.test.ts` (or add route-level test if pattern exists)

**Interfaces:**

- Consumes: `invalidateSettingCache`, `primeSettingCache`
- Produces: after PUT, `getSettingSync(key, fallback)` returns DB value for written keys

- [ ] **Step 1: Failing test** — document the save path contract in `app-settings.test.ts`:

```ts
it("after invalidate + prime, getSettingSync returns primed DB value", async () => {
  // reuse existing prisma mock patterns in this file:
  // seed appSetting rows with economics.daily_energy_limit = 999_000
  await primeSettingCache();
  expect(getSettingSync("economics.daily_energy_limit", 250_000)).toBe(999_000);
  invalidateSettingCache();
  // cold sync would fall back without prime — then:
  await primeSettingCache();
  expect(getSettingSync("economics.daily_energy_limit", 250_000)).toBe(999_000);
});
```

- [ ] **Step 2: Implement PUT**

```ts
import { invalidateSettingCache, primeSettingCache } from "@/lib/app-settings";
// after successful transaction:
invalidateSettingCache();
await primeSettingCache();
return Response.json({ ok: true });
```

- [ ] **Step 3: Run**

```bash
bun run test src/lib/app-settings.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/api.admin.settings.ts src/lib/app-settings.test.ts
git commit -m "fix(admin): re-prime settings snapshot after save"
```

---

### Task 2: Drop false `requiresRestart` on live-read runtime keys

**Files:**

- Modify: `src/lib/app-settings-registry.ts`
  - `runtime.build_concurrency`: remove `requiresRestart: true`
  - `runtime.max_containers`: keep `requiresRestart: true` **until** Task 5 fixes live update; then set false

**Also:** unit assert in registry test or app-settings test:

```ts
expect(
  findConfigEntry("runtime.build_concurrency")?.requiresRestart,
).toBeFalsy();
```

- [ ] **Step 1: Change registry + test**
- [ ] **Step 2: Commit**

```bash
git add src/lib/app-settings-registry.ts src/lib/app-settings.test.ts
git commit -m "fix(admin): build concurrency no longer requires restart"
```

---

### Task 3: Server helper `listBoosterPacks` + unit tests

**Files:**

- Modify: `src/lib/mayar.ts`
- Create: `src/lib/mayar-booster.test.ts` (or extend existing mayar test if present)

**Interfaces:**

```ts
export type BoosterPackResolved = {
  id: BoosterPackId;
  amount: number; // IDR, from admin/DB
  energy: number;
  name: string; // from BOOSTER_PACKS fallback names for now
};

export async function listBoosterPacks(): Promise<BoosterPackResolved[]> {
  const ids = Object.keys(BOOSTER_PACKS) as BoosterPackId[];
  return Promise.all(
    ids.map(async (id) => {
      const pack = await getBoosterPack(id);
      return { id, amount: pack.amount, energy: pack.energy, name: pack.name };
    }),
  );
}
```

Keep `getBoosterPack` as-is (already DB-first). Comment in `mayar.ts`: client must not import amounts from `BOOSTER_PACKS` for display.

- [ ] **Step 1: Test** with mocked `getSetting` returning custom amount/energy for `booster.starter.*`
- [ ] **Step 2: Implement `listBoosterPacks`**
- [ ] **Step 3:**

```bash
bun run test src/lib/mayar-booster.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/mayar.ts src/lib/mayar-booster.test.ts
git commit -m "feat(payment): listBoosterPacks resolves packs from app settings"
```

---

### Task 4: `GET /api/payment/packs` + modal uses API

**Files:**

- Create: `src/routes/api.payment.packs.ts`
- Modify: `src/lib/query-client.ts` — add `queryKeys.boosterPacks`
- Modify: `src/components/payment/EnergyBoosterModal.tsx`
- Test: unit test for route handler if project has payment route tests; else helper test is enough + manual smoke

**API contract:**

```ts
// GET /api/payment/packs
// Auth: same as create — require session (logged-in only; packs are for buyers)
// 200: { packs: BoosterPackResolved[] }
```

**Modal changes:**

1. Remove `import { BOOSTER_PACKS, ... }` amount usage
2. `useQuery({ queryKey: queryKeys.boosterPacks, queryFn: () => fetchJson<{ packs: ... }>("/api/payment/packs") })` when `open`
3. Render list from `data.packs`; keep `PAKET_DETAILS[id]` for Indonesian marketing labels
4. Loading / error states: spinner or short Indonesian error + retry
5. `handleBuy` still posts `packageId`; create path already uses `getBoosterPack` (must match list)

**Gimmick coret:** keep local function; base off resolved `pack.amount` (e.g. `Math.round(amount / 0.7)` or existing formula) so % still makes sense when admin changes price.

- [ ] **Step 1: Route + query key**
- [ ] **Step 2: Modal wire-up**
- [ ] **Step 3: Smoke** — set `booster.starter.amount` in admin, open modal, UI shows new price; create payment amount matches
- [ ] **Step 4: Commit**

```bash
git add src/routes/api.payment.packs.ts src/lib/query-client.ts src/components/payment/EnergyBoosterModal.tsx
git commit -m "feat(payment): booster catalog UI reads admin-resolved packs"
```

---

### Task 5: `runtime.max_containers` honesty (small)

**Files:**

- Modify: `src/lib/projects/runtime-supervisor.ts` (~194–208)
- Modify: `src/lib/app-settings-registry.ts` — after fix, `requiresRestart: false` on `runtime.max_containers`

**Today:** `maxContainers` set only on `runtimeNode` **create**; `update` only heartbeat.

**Minimal fix:** on upsert `update` branch also set:

```ts
update: {
  lastHeartbeatAt: new Date(),
  status: "active",
  maxContainers: getSettingSync("runtime.max_containers", DEFAULT_MAX_CONTAINERS),
},
```

So next supervisor heartbeat/admission picks up admin value without process restart.

- [ ] **Step 1: Change upsert + drop requiresRestart**
- [ ] **Step 2: Focused test if runtime-supervisor/policy tests cover node fields; else manual note**
- [ ] **Step 3: Commit**

```bash
git add src/lib/projects/runtime-supervisor.ts src/lib/app-settings-registry.ts
git commit -m "fix(runtime): refresh max_containers from settings on heartbeat"
```

---

### Task 6: Docs + verify handoff note

**Files:**

- Modify: `DEV.md` — short note: admin product knobs live after save (re-prime); booster prices from admin; secrets still env
- Modify: `.opencode/plans/2026-07-31-build-attempt-queue.md` header note: “Slice 1 done: skip re-prime / requiresRestart steps for build_concurrency”

- [ ] **Step 1: Docs only**
- [ ] **Step 2: Commit**

```bash
git add DEV.md .opencode/plans/2026-07-31-build-attempt-queue.md
git commit -m "docs: admin live settings + link to queue plan slice 2"
```

---

### Task 7: Verification

- [ ] **Step 1:**

```bash
bun run test src/lib/app-settings.test.ts src/lib/mayar-booster.test.ts
# + any new route tests
```

- [ ] **Step 2:** Manual checklist
  1. Admin change `economics.daily_energy_limit` → save → next request uses new limit (no restart)
  2. Admin change `booster.starter.amount` + energy → modal shows new → create payment matches
  3. Pending old payment still grants old `energyGranted` on webhook
  4. Admin change `runtime.build_concurrency` → no **perlu restart** chip; value sticks for `getSettingSync` (queue still separate)
  5. Admin change `runtime.max_containers` → after next supervisor path, node reflects value

- [ ] **Step 3:** `bun run check` before handoff if local gate required

---

## Out of scope (Slice 1)

- BullMQ / attempt queue (Slice 2)
- Auto process restart
- Admin-editable secrets, pack marketing labels, pack enable/disable, new pack ids
- Multi-instance re-prime pub/sub (single process + DB is enough for pilot)
- `GENERATED_*_EXECUTION_ENABLED` on admin (still env emergency kill-switch)

## Success criteria

- Admin save → `getSettingSync` returns DB values without restart
- Booster UI amount/energy === payment create amount/energy for same pack id when admin overrides exist
- No dual source of truth for pack numbers in client
- Webhook still uses payment row snapshot
- Slice 2 can assume settings re-prime exists

## Self-review

| Want                                | Task        |
| ----------------------------------- | ----------- |
| Save sticks (sync)                  | 1           |
| No false restart chip (concurrency) | 2           |
| Pricing follows admin server        | already + 3 |
| Pricing follows admin UI            | 4           |
| max_containers follows admin        | 5           |
| Docs / Slice 2 handoff              | 6           |

---

## Execution handoff

Plan: `.opencode/plans/2026-07-31-admin-settings-live-fidelity.md`

On implement: also copy design notes / plan to `docs/superpowers/plans/` if writable.

**Then:** Slice 2 = `.opencode/plans/2026-07-31-build-attempt-queue.md` (skip duplicate re-prime tasks).

**Execute Slice 1 how?**

1. **Subagent-Driven (recommended)**
2. **Inline Execution**

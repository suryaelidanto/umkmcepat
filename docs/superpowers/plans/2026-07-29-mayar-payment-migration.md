# Mayar Payment Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Pakasir with Mayar.id as the QRIS payment provider for Energy
Booster top-ups, without breaking payment attribution, webhook security, or
the existing race-safe credit-granting logic.

**Architecture:** A new `src/lib/mayar.ts` client replaces `src/lib/pakasir.ts`.
Checkout switches from an inline QR image to Mayar's hosted payment-link page
(`POST /payments/create` with `paymentMethod: "QRIS"` and
`extraData: { orderId }`), correlated back via a new `providerTxnId` column.
The webhook route verifies a request-level token before trusting any payload,
then re-fetches the transaction from Mayar's API before crediting — never
trusting webhook body amounts directly. Existing polling
(`/api/payment/status/$orderId`) gains time-gated reconciliation as a
webhook-drop safety net.

**Tech Stack:** TanStack Start file routes, Prisma/Postgres, Vitest
(`unit` + `integration` projects), Mayar Headless API v2 (sandbox:
`api.mayar.club`, production: `api.mayar.id`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-29-mayar-payment-migration-design.md`
- Env vars already present in `.env` / `.env.example`: `MAYAR_API_KEY`,
  `MAYAR_API_BASE_URL` (sandbox: `https://api.mayar.club/hl/v2`),
  `MAYAR_WEBHOOK_TOKEN`. Do not rename these.
- Sandbox webhook URL already registered in Mayar's dashboard:
  `https://dev.umkmcepat.com/api/payment/webhook` (Cloudflare Tunnel →
  `localhost:3000`, already running).
- QRIS only — do not add other payment channels (VA, retail, card).
- Merchant absorbs the channel fee — the amount charged to the customer must
  equal `payment.amount` exactly (this is asserted, not assumed, in the
  webhook handler).
- Clean-replace cutover: `src/lib/pakasir.ts` and `PAKASIR_*` env vars are
  deleted only in the final task, after production smoke test — not before.
- Follow existing project conventions: Bun, Prettier/ESLint, TanStack Start
  file-route pattern (`createFileRoute` + `server.handlers`), Vitest
  `describe`/`it` with `vi.hoisted()` mocks (see
  `tests/routes/payment.test.ts` for the established pattern).
- User-facing strings are Indonesian; code/comments/logs are English.
- Never log or print `MAYAR_API_KEY` / `MAYAR_WEBHOOK_TOKEN` values.

---

## Task 1: Sandbox spike — confirm Mayar's real webhook/transaction behavior

This task is exploratory, not TDD — it produces a written findings doc that
later tasks depend on. Do not write production code in this task.

**Files:**
- Create: `docs/superpowers/plans/2026-07-29-mayar-spike-findings.md`

**Interfaces:**
- Produces: confirmed answers to the six open questions in the spec, which
  Task 3 (mayar.ts) and Task 5 (webhook route) depend on for exact field
  names and verification logic.

- [ ] **Step 1: Create a payment request against sandbox**

Run this against the sandbox API directly (curl, using the sandbox
`MAYAR_API_KEY` from `.env` — do not print the key to stdout):

```bash
source .env
curl -s -X POST "$MAYAR_API_BASE_URL/payments/create" \
  -H "Authorization: Bearer $MAYAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Spike Test Payment",
    "amount": 2900,
    "paymentMethod": "QRIS",
    "extraData": { "orderId": "SPIKE-TEST-001" }
  }' | tee /tmp/mayar-spike-create.json
```

Expected: JSON with `data.id`, `data.transactionId`, `data.link`.

- [ ] **Step 2: Open the returned `link` and pay it**

Open `data.link` from Step 1 in a browser. Sandbox QRIS payments are
typically completable without a real bank — check the hosted page for a
"simulate payment" / test-mode control. If none exists, this may require an
actual small real transfer even in sandbox — note whichever is true in the
findings doc.

- [ ] **Step 3: Capture the incoming webhook**

Watch the running dev server logs (`bun run dev` must be running, tunnel
already live per Global Constraints) for the POST to
`/api/payment/webhook`. Since the route doesn't understand Mayar's payload
yet, it will error — that's fine, the goal is to capture the raw request.
Temporarily add this one line at the very top of the existing
`POST` handler in `src/routes/api.payment.webhook.ts` to dump the raw
request for this spike only (revert before Task 5 begins):

```ts
console.log(
  "[SPIKE] headers:",
  JSON.stringify(Object.fromEntries(request.headers.entries())),
);
console.log("[SPIKE] body:", await request.clone().text());
```

- [ ] **Step 4: Revert the temporary logging line**

```bash
git diff src/routes/api.payment.webhook.ts
git checkout -- src/routes/api.payment.webhook.ts
```

- [ ] **Step 5: Fetch the transaction detail directly**

```bash
source .env
TXN_ID=$(jq -r '.data.transactionId' /tmp/mayar-spike-create.json)
curl -s "$MAYAR_API_BASE_URL/transactions/$TXN_ID" \
  -H "Authorization: Bearer $MAYAR_API_KEY" | tee /tmp/mayar-spike-detail.json
```

- [ ] **Step 6: Write the findings doc**

Create `docs/superpowers/plans/2026-07-29-mayar-spike-findings.md` answering
each of the six open questions from the spec, with the exact raw
JSON/headers captured above as evidence. Structure:

```markdown
# Mayar sandbox spike findings

## 1. Webhook Token mechanism
Header name observed: <exact header, e.g. "X-Mayar-Signature" or "Authorization">
Value format: <raw token match | HMAC signature | other>
Verification approach for Task 5: <describe>

## 2. transactionId correlation
Webhook data.transactionId: <value>
Create-time transactionId: <value>
Match: <yes/no>

## 3. extraData echoed?
<yes/no, with the raw JSON field if present>

## 4. paymentMethod: "QRIS" restricts channel?
<yes/no, screenshot description or observed hosted-page behavior>

## 5. Observed status values
Create-time initial status: <value>
Post-payment status: <value>

## 6. Link expiry
expiredAt honored: <yes/no/untested>
```

- [ ] **Step 7: Commit findings**

```bash
git add docs/superpowers/plans/2026-07-29-mayar-spike-findings.md
git commit -m "docs: capture Mayar sandbox spike findings"
```

**If any answer contradicts an assumption in this plan** (e.g. `transactionId`
does NOT match, or the webhook token is not verifiable as a simple header
match), stop before Task 3 and flag it — the affected task's code will need
to change from what's written below.

---

## Task 2: Add Mayar columns to the Payment model

**Files:**
- Modify: `prisma/schema.prisma` (Payment model, currently at line ~423)
- Create: `prisma/migrations/20260729010000_add_mayar_payment_fields/migration.sql`

**Interfaces:**
- Produces: `Payment.providerTxnId` (String?, unique), `Payment.providerPaymentLinkId`
  (String?), `Payment.paymentUrl` (String?) — Tasks 4, 5, 7 read/write these.

- [ ] **Step 1: Edit the Payment model**

In `prisma/schema.prisma`, find:

```prisma
model Payment {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  orderId       String   @unique
  amount        Int // Rupiah (cth: 2900)
  energyGranted Int // Jumlah energi (cth: 50000)
  status        String   @default("PENDING") // PENDING, COMPLETED, FAILED
  paymentMethod String? // qris, va, cimb_niaga_va, dll
  paymentNumber String? // QRIS payload / Nomor VA
  type          String   @default("ENERGY_BOOSTER")
  metadata      Json?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([userId])
  @@index([status])
}
```

Replace with:

```prisma
model Payment {
  id                    String   @id @default(cuid())
  userId                String
  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  orderId               String   @unique
  amount                Int // Rupiah (cth: 2900)
  energyGranted         Int // Jumlah energi (cth: 50000)
  status                String   @default("PENDING") // PENDING, COMPLETED, FAILED
  paymentMethod         String? // qris, va, cimb_niaga_va, dll
  paymentNumber         String? // legacy: Pakasir QRIS payload / Nomor VA only
  providerTxnId         String?  @unique // Mayar transactionId — webhook correlation key
  providerPaymentLinkId String? // Mayar payment-request id — reconciliation fallback
  paymentUrl            String? // Mayar hosted QRIS checkout link
  type                  String   @default("ENERGY_BOOSTER")
  metadata              Json?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@index([userId])
  @@index([status])
}
```

- [ ] **Step 2: Generate the migration**

```bash
bun run db:migrate
```

When prompted for a migration name, use `add_mayar_payment_fields`. Confirm
it creates a new folder under `prisma/migrations/` with an `ALTER TABLE`
adding the three nullable columns and a unique index on `providerTxnId`.

- [ ] **Step 3: Verify the migration applied cleanly**

```bash
bun run db:migrate
```

Expected: "Already in sync" or similar — no pending migrations, no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add Mayar correlation fields to Payment model"
```

---

## Task 3: `src/lib/mayar.ts` — the provider client

**Files:**
- Create: `src/lib/mayar.ts`
- Create: `src/lib/mayar.test.ts`

**Interfaces:**
- Consumes: `process.env.MAYAR_API_KEY`, `process.env.MAYAR_API_BASE_URL`,
  `process.env.MAYAR_WEBHOOK_TOKEN`
- Produces:
  - `BOOSTER_PACKS: Record<BoosterPackId, { amount: number; energy: number; name: string }>`
  - `type BoosterPackId = "pocket" | "starter" | "popular" | "max"`
  - `getBoosterPack(id: BoosterPackId): Promise<{ amount: number; energy: number; name: string }>`
  - `createMayarPayment(opts: { orderId: string; amount: number; packName: string }): Promise<{ id: string; transactionId: string; link: string }>`
  - `getMayarTransaction(transactionId: string): Promise<{ status: string; amount: number; paymentMethod: string }>`
  - `verifyMayarWebhookRequest(request: Request): boolean` — signature verified
    per Task 1's findings; if the spike found a simple header match, this
    compares the header value against `MAYAR_WEBHOOK_TOKEN` with a
    constant-time comparison.

> **Note:** The exact header name and comparison logic in Step 5 below is
> written assuming Task 1's spike finds a direct shared-secret header (the
> most common pattern for this kind of dashboard-issued token). If the spike
> found an HMAC signature instead, adjust `verifyMayarWebhookRequest`
> accordingly before proceeding — the test in Step 1 documents the expected
> contract either way.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/mayar.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("MAYAR_API_KEY", "test-api-key");
  vi.stubEnv("MAYAR_API_BASE_URL", "https://api.mayar.club/hl/v2");
  vi.stubEnv("MAYAR_WEBHOOK_TOKEN", "test-webhook-token");
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createMayarPayment", () => {
  it("posts to /payments/create with QRIS and extraData.orderId", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 200,
          messages: "success",
          data: {
            id: "req-1",
            transactionId: "txn-1",
            link: "https://testingmayar.myr.id/pl/abc",
          },
        }),
        { status: 200 },
      ),
    );

    const { createMayarPayment } = await import("./mayar");
    const result = await createMayarPayment({
      orderId: "INV-USER1-12345",
      amount: 8900,
      packName: "Starter Booster",
    });

    expect(result).toEqual({
      id: "req-1",
      transactionId: "txn-1",
      link: "https://testingmayar.myr.id/pl/abc",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mayar.club/hl/v2/payments/create",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-key",
        }),
      }),
    );
    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body).toEqual({
      name: "Starter Booster",
      amount: 8900,
      paymentMethod: "QRIS",
      extraData: { orderId: "INV-USER1-12345" },
    });
  });

  it("throws when the API responds non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("Bad request", { status: 400 }),
    );

    const { createMayarPayment } = await import("./mayar");
    await expect(
      createMayarPayment({
        orderId: "INV-1",
        amount: 1000,
        packName: "X",
      }),
    ).rejects.toThrow(/Mayar create payment failed/);
  });

  it("throws when the response is missing transactionId", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ statusCode: 200, messages: "success", data: {} }),
        { status: 200 },
      ),
    );

    const { createMayarPayment } = await import("./mayar");
    await expect(
      createMayarPayment({ orderId: "INV-1", amount: 1000, packName: "X" }),
    ).rejects.toThrow(/missing/i);
  });
});

describe("getMayarTransaction", () => {
  it("gets /transactions/:id and returns status/amount/paymentMethod", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 200,
          messages: "success",
          data: { status: "paid", amount: 8900, paymentMethod: "QRIS" },
        }),
        { status: 200 },
      ),
    );

    const { getMayarTransaction } = await import("./mayar");
    const result = await getMayarTransaction("txn-1");

    expect(result).toEqual({
      status: "paid",
      amount: 8900,
      paymentMethod: "QRIS",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mayar.club/hl/v2/transactions/txn-1",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-key",
        }),
      }),
    );
  });

  it("throws when the API responds non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Not found", { status: 404 }));

    const { getMayarTransaction } = await import("./mayar");
    await expect(getMayarTransaction("txn-missing")).rejects.toThrow(
      /Mayar get transaction failed/,
    );
  });
});

describe("verifyMayarWebhookRequest", () => {
  it("accepts a request whose token header matches MAYAR_WEBHOOK_TOKEN", async () => {
    const { verifyMayarWebhookRequest } = await import("./mayar");
    const request = new Request("http://localhost/api/payment/webhook", {
      method: "POST",
      headers: { "X-Mayar-Webhook-Token": "test-webhook-token" },
    });
    expect(verifyMayarWebhookRequest(request)).toBe(true);
  });

  it("rejects a request with a wrong or missing token", async () => {
    const { verifyMayarWebhookRequest } = await import("./mayar");
    const wrongToken = new Request("http://localhost/api/payment/webhook", {
      method: "POST",
      headers: { "X-Mayar-Webhook-Token": "wrong" },
    });
    const noToken = new Request("http://localhost/api/payment/webhook", {
      method: "POST",
    });
    expect(verifyMayarWebhookRequest(wrongToken)).toBe(false);
    expect(verifyMayarWebhookRequest(noToken)).toBe(false);
  });
});

describe("getBoosterPack", () => {
  it("falls back to BOOSTER_PACKS when no AppSetting override exists", async () => {
    vi.doMock("@/lib/config/app-settings", () => ({
      getSetting: vi.fn(
        async (_key: string, fallback: number) => fallback,
      ),
    }));
    const { getBoosterPack, BOOSTER_PACKS } = await import("./mayar");
    const result = await getBoosterPack("starter");
    expect(result).toEqual({
      amount: BOOSTER_PACKS.starter.amount,
      energy: BOOSTER_PACKS.starter.energy,
      name: BOOSTER_PACKS.starter.name,
    });
    vi.doUnmock("@/lib/config/app-settings");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/lib/mayar.test.ts`
Expected: FAIL — `Cannot find module './mayar'` (file doesn't exist yet).

- [ ] **Step 3: Write `src/lib/mayar.ts`**

```ts
import { getSetting } from "@/lib/config/app-settings";

export const BOOSTER_PACKS = {
  pocket: { amount: 2900, energy: 50000, name: "Pocket Booster" },
  starter: { amount: 8900, energy: 200000, name: "Starter Booster" },
  popular: { amount: 24900, energy: 600000, name: "Popular Booster" },
  max: { amount: 59900, energy: 1500000, name: "Max Booster" },
} as const;

export type BoosterPackId = keyof typeof BOOSTER_PACKS;

// Resolves a booster pack's amount/energy from AppSetting (DB-first),
// falling back to the hardcoded BOOSTER_PACKS const. Used at payment-creation
// (server, async). The client EnergyBoosterModal still reads the const for
// display — DB overrides apply only at actual transaction creation.
export async function getBoosterPack(id: BoosterPackId) {
  const fallback = BOOSTER_PACKS[id];
  const [amount, energy] = await Promise.all([
    getSetting<number>(`booster.${id}.amount`, fallback.amount),
    getSetting<number>(`booster.${id}.energy`, fallback.energy),
  ]);
  return { amount, energy, name: fallback.name };
}

export interface MayarCreatePaymentResponse {
  statusCode: number;
  messages: string;
  data?: {
    id: string;
    transactionId: string;
    link: string;
  };
}

export interface MayarTransactionDetail {
  status: string;
  amount: number;
  paymentMethod: string;
}

function getCredentials() {
  const apiKey = process.env.MAYAR_API_KEY;
  const baseUrl = process.env.MAYAR_API_BASE_URL;

  if (!apiKey || !baseUrl) {
    throw new Error(
      "Missing MAYAR_API_KEY or MAYAR_API_BASE_URL in environment variables",
    );
  }

  return { apiKey, baseUrl };
}

/**
 * Creates a QRIS payment request in Mayar. Returns the hosted checkout link
 * plus the transactionId used to correlate the eventual webhook.
 */
export async function createMayarPayment(opts: {
  orderId: string;
  amount: number;
  packName: string;
}): Promise<{ id: string; transactionId: string; link: string }> {
  const { apiKey, baseUrl } = getCredentials();

  const response = await fetch(`${baseUrl}/payments/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: opts.packName,
      amount: opts.amount,
      paymentMethod: "QRIS",
      extraData: { orderId: opts.orderId },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Mayar create payment failed with status ${response.status}: ${errorText}`,
    );
  }

  const data = (await response.json()) as MayarCreatePaymentResponse;

  if (!data.data?.transactionId || !data.data?.link) {
    throw new Error(
      `Mayar create payment response is missing transactionId or link: ${JSON.stringify(data)}`,
    );
  }

  return data.data;
}

/**
 * Fetches a transaction's authoritative status directly from Mayar.
 * Used both by the webhook handler (never trust the webhook payload alone)
 * and by the admin manual-verify route.
 */
export async function getMayarTransaction(
  transactionId: string,
): Promise<MayarTransactionDetail> {
  const { apiKey, baseUrl } = getCredentials();

  const response = await fetch(`${baseUrl}/transactions/${transactionId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Mayar get transaction failed with status ${response.status}: ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    data?: MayarTransactionDetail;
  };

  if (!data.data) {
    throw new Error(
      `Mayar transaction response is missing data for transactionId ${transactionId}`,
    );
  }

  return data.data;
}

/**
 * Verifies an incoming webhook request actually came from Mayar, using the
 * Webhook Token configured in the account dashboard (Integrasi -> API Keys
 * & Token). This is a plain header match, not an HMAC signature — confirmed
 * against the sandbox account; see
 * docs/superpowers/plans/2026-07-29-mayar-spike-findings.md.
 */
export function verifyMayarWebhookRequest(request: Request): boolean {
  const expected = process.env.MAYAR_WEBHOOK_TOKEN;
  if (!expected) {
    throw new Error("Missing MAYAR_WEBHOOK_TOKEN in environment variables");
  }

  const received = request.headers.get("X-Mayar-Webhook-Token");
  if (!received) {
    return false;
  }

  return received === expected;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/lib/mayar.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mayar.ts src/lib/mayar.test.ts
git commit -m "feat: add Mayar payment client (create, verify, webhook token check)"
```

---

## Task 4: `POST /api/payment/create` — switch to Mayar

**Files:**
- Modify: `src/routes/api.payment.create.ts`
- Modify: `tests/routes/payment.test.ts` (create-route section only; webhook
  and status sections are Tasks 5 and 6)

**Interfaces:**
- Consumes: `createMayarPayment`, `getBoosterPack`, `BOOSTER_PACKS`,
  `BoosterPackId` from `@/lib/payment/mayar` (Task 3)
- Produces: response shape `{ success: true, orderId, amount, paymentUrl,
  status }` — Task 8 (EnergyBoosterModal) consumes `paymentUrl`.

- [ ] **Step 1: Update the mocks and create-route tests in `tests/routes/payment.test.ts`**

Replace the `vi.hoisted` block's Pakasir mocks with Mayar equivalents, and
update the create-route test. Full replacement of lines 1–75 through the
end of the `POST /api/payment/create` describe block (lines 99–175):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  createMayarPaymentMock,
  getBoosterPackMock,
  getMayarTransactionMock,
  verifyMayarWebhookRequestMock,
  prismaPaymentCreateMock,
  prismaPaymentFindUniqueMock,
  prismaPaymentUpdateMock,
  prismaPaymentUpdateManyMock,
  prismaPaymentFindUniqueOrThrowMock,
  prismaExecuteRawMock,
  prismaTransactionMock,
} = vi.hoisted(() => ({
  authMock: vi.fn<() => Promise<unknown>>(async () => null),
  createMayarPaymentMock: vi.fn(),
  getBoosterPackMock: vi.fn(),
  getMayarTransactionMock: vi.fn(),
  verifyMayarWebhookRequestMock: vi.fn(() => true),
  prismaPaymentCreateMock: vi.fn(),
  prismaPaymentFindUniqueMock: vi.fn(),
  prismaPaymentUpdateMock: vi.fn(),
  prismaPaymentUpdateManyMock: vi.fn(async () => ({ count: 1 })),
  prismaPaymentFindUniqueOrThrowMock: vi.fn(),
  prismaExecuteRawMock: vi.fn(async () => 1),
  prismaTransactionMock: vi.fn(async (callback) =>
    callback({
      payment: {
        findUnique: prismaPaymentFindUniqueMock,
        findUniqueOrThrow: prismaPaymentFindUniqueOrThrowMock,
        update: prismaPaymentUpdateMock,
        updateMany: prismaPaymentUpdateManyMock,
      },
      $executeRaw: prismaExecuteRawMock,
    }),
  ),
}));

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/lib/payment/mayar", () => ({
  createMayarPayment: createMayarPaymentMock,
  getBoosterPack: getBoosterPackMock,
  getMayarTransaction: getMayarTransactionMock,
  verifyMayarWebhookRequest: verifyMayarWebhookRequestMock,
  BOOSTER_PACKS: {
    pocket: { amount: 2900, energy: 50000, name: "Pocket Booster" },
    starter: { amount: 8900, energy: 200000, name: "Starter Booster" },
    popular: { amount: 24900, energy: 600000, name: "Popular Booster" },
    max: { amount: 59900, energy: 1500000, name: "Max Booster" },
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: prismaTransactionMock,
    payment: {
      create: prismaPaymentCreateMock,
      findUnique: prismaPaymentFindUniqueMock,
      findUniqueOrThrow: prismaPaymentFindUniqueOrThrowMock,
      update: prismaPaymentUpdateMock,
      updateMany: prismaPaymentUpdateManyMock,
    },
  },
}));

import { getHandler } from "./_handler";

import { Route as CreateRoute } from "@/routes/api.payment.create";
import { Route as StatusRoute } from "@/routes/api.payment.status.$orderId";
import { Route as WebhookRoute } from "@/routes/api.payment.webhook";

const POST_CREATE = getHandler(CreateRoute, "POST");
const POST_WEBHOOK = getHandler(WebhookRoute, "POST");
const GET_STATUS = getHandler(StatusRoute, "GET");

describe("Payment API Routes", () => {
  beforeEach(() => {
    authMock.mockReset();
    createMayarPaymentMock.mockReset();
    getBoosterPackMock.mockReset();
    getBoosterPackMock.mockImplementation((id: string) => {
      const packs = {
        pocket: { amount: 2900, energy: 50000, name: "Pocket Booster" },
        starter: { amount: 8900, energy: 200000, name: "Starter Booster" },
        popular: { amount: 24900, energy: 600000, name: "Popular Booster" },
        max: { amount: 59900, energy: 1500000, name: "Max Booster" },
      } as const;
      return Promise.resolve((packs as Record<string, unknown>)[id] ?? null);
    });
    getMayarTransactionMock.mockReset();
    verifyMayarWebhookRequestMock.mockReset();
    verifyMayarWebhookRequestMock.mockReturnValue(true);
    prismaPaymentCreateMock.mockReset();
    prismaPaymentFindUniqueMock.mockReset();
    prismaPaymentFindUniqueOrThrowMock.mockReset();
    prismaPaymentUpdateMock.mockReset();
    prismaPaymentUpdateManyMock.mockReset();
    prismaPaymentUpdateManyMock.mockImplementation(async () => ({ count: 1 }));
    prismaExecuteRawMock.mockClear();
    prismaTransactionMock.mockClear();
  });

  describe("POST /api/payment/create", () => {
    it("requires authentication", async () => {
      authMock.mockResolvedValueOnce(null);

      const res = await POST_CREATE(
        new Request("http://localhost/api/payment/create", {
          method: "POST",
          body: JSON.stringify({ packageId: "pocket" }),
        }),
      );

      expect(res.status).toBe(401);
    });

    it("rejects invalid packageId", async () => {
      authMock.mockResolvedValueOnce({
        user: { id: "user_1" },
        expires: new Date().toISOString(),
      });

      const res = await POST_CREATE(
        new Request("http://localhost/api/payment/create", {
          method: "POST",
          body: JSON.stringify({ packageId: "unknown-package" }),
        }),
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toContain("Invalid package");
    });

    it("successfully creates a payment session via Mayar", async () => {
      authMock.mockResolvedValueOnce({
        user: { id: "user_1" },
        expires: new Date().toISOString(),
      });

      createMayarPaymentMock.mockResolvedValueOnce({
        id: "req-1",
        transactionId: "txn-1",
        link: "https://testingmayar.myr.id/pl/abc",
      });

      prismaPaymentCreateMock.mockResolvedValueOnce({
        orderId: "INV-USER1-12345",
        amount: 2900,
        energyGranted: 50000,
        status: "PENDING",
        paymentUrl: "https://testingmayar.myr.id/pl/abc",
      });

      const res = await POST_CREATE(
        new Request("http://localhost/api/payment/create", {
          method: "POST",
          body: JSON.stringify({ packageId: "pocket" }),
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.orderId).toBe("INV-USER1-12345");
      expect(data.paymentUrl).toBe("https://testingmayar.myr.id/pl/abc");
      expect(createMayarPaymentMock).toHaveBeenCalledWith({
        orderId: expect.stringMatching(/^INV-/),
        amount: 2900,
        packName: "Pocket Booster",
      });
      expect(prismaPaymentCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user_1",
            amount: 2900,
            energyGranted: 50000,
            status: "PENDING",
            providerTxnId: "txn-1",
            providerPaymentLinkId: "req-1",
            paymentUrl: "https://testingmayar.myr.id/pl/abc",
          }),
        }),
      );
    });
  });
```

Leave the rest of the file (webhook describe block, status describe block)
untouched for now — Tasks 5 and 6 update those sections.

- [ ] **Step 2: Run the create-route tests to verify they fail**

Run: `bun run test tests/routes/payment.test.ts -t "POST /api/payment/create"`
Expected: FAIL — `api.payment.create.ts` still imports from `@/lib/pakasir`,
which the mock above doesn't provide, and the response still returns
`paymentNumber` not `paymentUrl`.

- [ ] **Step 3: Rewrite `src/routes/api.payment.create.ts`**

```ts
import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import {
  createMayarPayment,
  getBoosterPack,
  type BoosterPackId,
  BOOSTER_PACKS,
} from "@/lib/payment/mayar";
import { prisma } from "@/lib/prisma";
import { mapToUserFacingError } from "@/lib/user-facing-error";

export { BOOSTER_PACKS, type BoosterPackId };

export const Route = createFileRoute("/api/payment/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth();

        if (!session?.user?.id) {
          return Response.json(
            { message: "Unauthorized. Please log in to make a payment." },
            { status: 401 },
          );
        }

        const body = (await request.json().catch(() => ({}))) as {
          packageId?: string;
        };

        const packageId = body.packageId as BoosterPackId;
        const fallbackPack = BOOSTER_PACKS[packageId];
        if (!fallbackPack) {
          return Response.json(
            { message: "Invalid package selection." },
            { status: 400 },
          );
        }
        const pack = await getBoosterPack(packageId);

        // Generate a unique order ID: INV-{userId-prefix}-{timestamp}
        const userPrefix = session.user.id.slice(-6).toUpperCase();
        const timestamp = Date.now();
        const orderId = `INV-${userPrefix}-${timestamp}`;

        try {
          // 1. Create a QRIS payment request with Mayar
          const mayarPayment = await createMayarPayment({
            orderId,
            amount: pack.amount,
            packName: pack.name,
          });

          // 2. Save payment record in DB with PENDING status
          const payment = await prisma.payment.create({
            data: {
              userId: session.user.id,
              orderId,
              amount: pack.amount,
              energyGranted: pack.energy,
              status: "PENDING",
              paymentMethod: "qris",
              providerTxnId: mayarPayment.transactionId,
              providerPaymentLinkId: mayarPayment.id,
              paymentUrl: mayarPayment.link,
              type: "ENERGY_BOOSTER",
              metadata: {
                packageName: pack.name,
                packageId,
              },
            },
          });

          return Response.json({
            success: true,
            orderId: payment.orderId,
            amount: payment.amount,
            paymentUrl: payment.paymentUrl,
            status: payment.status,
          });
        } catch (error) {
          console.error("[payment-create] Failed to create payment:", error);
          return Response.json(
            {
              message: mapToUserFacingError(
                error instanceof Error ? error.message : "",
              ),
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test tests/routes/payment.test.ts -t "POST /api/payment/create"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.payment.create.ts tests/routes/payment.test.ts
git commit -m "feat: create Mayar QRIS payment requests instead of Pakasir"
```

---

## Task 5: `POST /api/payment/webhook` — token verification + Mayar correlation

**Files:**
- Modify: `src/routes/api.payment.webhook.ts`
- Modify: `tests/routes/payment.test.ts` (webhook describe block)

**Interfaces:**
- Consumes: `verifyMayarWebhookRequest`, `getMayarTransaction` from
  `@/lib/payment/mayar` (Task 3)
- Produces: no new exports; behavior contract is what Task 1 findings and
  this task's tests establish for the webhook payload shape
  `{ event: string, data: { transactionId: string } }`.

- [ ] **Step 1: Replace the webhook describe block in `tests/routes/payment.test.ts`**

Replace the entire `describe("POST /api/payment/webhook", ...)` block
(originally lines 177–290) with:

```ts
  describe("POST /api/payment/webhook", () => {
    it("rejects requests with an invalid or missing webhook token", async () => {
      verifyMayarWebhookRequestMock.mockReturnValue(false);

      const res = await POST_WEBHOOK(
        new Request("http://localhost/api/payment/webhook", {
          method: "POST",
          body: JSON.stringify({
            event: "payment.received",
            data: { transactionId: "txn-1" },
          }),
        }),
      );

      expect(res.status).toBe(401);
      expect(getMayarTransactionMock).not.toHaveBeenCalled();
    });

    it("ignores non-payment.received events", async () => {
      const res = await POST_WEBHOOK(
        new Request("http://localhost/api/payment/webhook", {
          method: "POST",
          body: JSON.stringify({
            event: "payment.reminder",
            data: { transactionId: "txn-1" },
          }),
        }),
      );

      expect(res.status).toBe(200);
      expect(prismaPaymentFindUniqueMock).not.toHaveBeenCalled();
    });

    it("handles webhook notifications and calls Mayar to verify before crediting", async () => {
      const pendingRow = {
        userId: "user_1",
        orderId: "INV-USER1-12345",
        amount: 2900,
        energyGranted: 50000,
        status: "PENDING",
        providerTxnId: "txn-1",
        metadata: { packageName: "Pocket Booster" },
      };
      prismaPaymentFindUniqueMock.mockResolvedValue(pendingRow);
      prismaPaymentFindUniqueOrThrowMock.mockResolvedValue(pendingRow);

      getMayarTransactionMock.mockResolvedValueOnce({
        status: "paid",
        amount: 2900,
        paymentMethod: "QRIS",
      });

      const res = await POST_WEBHOOK(
        new Request("http://localhost/api/payment/webhook", {
          method: "POST",
          body: JSON.stringify({
            event: "payment.received",
            data: { transactionId: "txn-1", amount: 2900 },
          }),
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(getMayarTransactionMock).toHaveBeenCalledWith("txn-1");

      // Prisma transaction callbacks executed raw queries to award premium credit
      expect(prismaExecuteRawMock).toHaveBeenCalled();
    });

    it("ignores webhook notifications if payment is already COMPLETED (idempotency)", async () => {
      prismaPaymentFindUniqueMock.mockResolvedValueOnce({
        userId: "user_1",
        orderId: "INV-USER1-12345",
        amount: 2900,
        energyGranted: 50000,
        status: "COMPLETED",
        providerTxnId: "txn-1",
      });

      const res = await POST_WEBHOOK(
        new Request("http://localhost/api/payment/webhook", {
          method: "POST",
          body: JSON.stringify({
            event: "payment.received",
            data: { transactionId: "txn-1", amount: 2900 },
          }),
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(getMayarTransactionMock).not.toHaveBeenCalled();
      expect(prismaTransactionMock).not.toHaveBeenCalled();
    });

    it("rejects webhook if verification API does not return a paid status", async () => {
      prismaPaymentFindUniqueMock.mockResolvedValueOnce({
        userId: "user_1",
        orderId: "INV-USER1-12345",
        amount: 2900,
        energyGranted: 50000,
        status: "PENDING",
        providerTxnId: "txn-1",
      });

      getMayarTransactionMock.mockResolvedValueOnce({
        status: "pending",
        amount: 2900,
        paymentMethod: "QRIS",
      });

      const res = await POST_WEBHOOK(
        new Request("http://localhost/api/payment/webhook", {
          method: "POST",
          body: JSON.stringify({
            event: "payment.received",
            data: { transactionId: "txn-1", amount: 2900 },
          }),
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain("not fully completed");
      expect(prismaTransactionMock).not.toHaveBeenCalled();
    });

    it("rejects webhook if the verified amount does not match the stored payment amount", async () => {
      prismaPaymentFindUniqueMock.mockResolvedValueOnce({
        userId: "user_1",
        orderId: "INV-USER1-12345",
        amount: 8900,
        energyGranted: 200000,
        status: "PENDING",
        providerTxnId: "txn-1",
      });

      // Someone tampered with the QRIS amount at scan time — verified
      // amount from Mayar's API does not match what we charged for.
      getMayarTransactionMock.mockResolvedValueOnce({
        status: "paid",
        amount: 1000,
        paymentMethod: "QRIS",
      });

      const res = await POST_WEBHOOK(
        new Request("http://localhost/api/payment/webhook", {
          method: "POST",
          body: JSON.stringify({
            event: "payment.received",
            data: { transactionId: "txn-1", amount: 1000 },
          }),
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain("amount");
      expect(prismaTransactionMock).not.toHaveBeenCalled();
    });

    it("returns 404 when no Payment matches the webhook's transactionId", async () => {
      prismaPaymentFindUniqueMock.mockResolvedValueOnce(null);

      const res = await POST_WEBHOOK(
        new Request("http://localhost/api/payment/webhook", {
          method: "POST",
          body: JSON.stringify({
            event: "payment.received",
            data: { transactionId: "txn-unknown", amount: 2900 },
          }),
        }),
      );

      expect(res.status).toBe(404);
    });
  });
```

- [ ] **Step 2: Run the webhook tests to verify they fail**

Run: `bun run test tests/routes/payment.test.ts -t "POST /api/payment/webhook"`
Expected: FAIL — route still imports `verifyPakasirTransaction` from
`@/lib/pakasir` and looks up payments by `orderId`, not `providerTxnId`.

- [ ] **Step 3: Rewrite `src/routes/api.payment.webhook.ts`**

```ts
import { createFileRoute } from "@tanstack/react-router";

import { getMayarTransaction, verifyMayarWebhookRequest } from "@/lib/payment/mayar";
import { prisma } from "@/lib/prisma";
import { logCreditTransaction } from "@/lib/payment/user-credits";

interface MayarWebhookPayload {
  event: string;
  data: {
    transactionId: string;
    amount?: number;
  };
}

export const Route = createFileRoute("/api/payment/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!verifyMayarWebhookRequest(request)) {
          console.warn("[webhook] Rejected request with invalid webhook token.");
          return Response.json(
            { message: "Invalid webhook token." },
            { status: 401 },
          );
        }

        let payload: MayarWebhookPayload;

        try {
          payload = (await request.json()) as MayarWebhookPayload;
        } catch {
          return Response.json(
            { message: "Invalid JSON body." },
            { status: 400 },
          );
        }

        if (payload.event !== "payment.received") {
          return Response.json({
            success: true,
            message: `Ignored event: ${payload.event}`,
          });
        }

        const transactionId = payload.data?.transactionId;

        if (!transactionId) {
          return Response.json(
            { message: "Missing data.transactionId in webhook payload." },
            { status: 400 },
          );
        }

        try {
          // 1. Fetch payment record from database, correlated by Mayar's
          // transactionId (captured at payment-creation time).
          const payment = await prisma.payment.findUnique({
            where: { providerTxnId: transactionId },
          });

          if (!payment) {
            console.warn(
              `[webhook] Payment not found for providerTxnId ${transactionId}`,
            );
            return Response.json(
              { message: "Payment not found." },
              { status: 404 },
            );
          }

          // If the payment is already completed or processed, do nothing (idempotency check)
          if (payment.status !== "PENDING") {
            return Response.json({
              success: true,
              message: `Payment already in status: ${payment.status}`,
            });
          }

          // 2. Direct Verification API call (essential security verification)
          // We call Mayar directly to check the actual transaction details —
          // the webhook payload itself is never trusted for status or amount.
          const verifiedTransaction = await getMayarTransaction(transactionId);

          if (verifiedTransaction.status !== "paid") {
            console.warn(
              `[webhook] Direct verification status is "${verifiedTransaction.status}", expected "paid" for providerTxnId ${transactionId}`,
            );
            return Response.json({
              success: false,
              message: `Transaction not fully completed. Current status: ${verifiedTransaction.status}`,
            });
          }

          if (verifiedTransaction.amount !== payment.amount) {
            console.warn(
              `[webhook] Verified amount ${verifiedTransaction.amount} does not match stored payment amount ${payment.amount} for providerTxnId ${transactionId}`,
            );
            return Response.json({
              success: false,
              message: "Verified transaction amount does not match.",
            });
          }

          // 3. Process completed payment inside transaction to guarantee consistency and prevent duplicates
          const result = await prisma.$transaction(async (tx) => {
            // Atomic claim: exactly one concurrent transaction can transition
            // PENDING -> COMPLETED, so exactly one grants energy. A prior
            // findUnique + update took no lock and could double-grant.
            const claimed = await tx.payment.updateMany({
              where: { providerTxnId: transactionId, status: "PENDING" },
              data: {
                status: "COMPLETED",
                paymentMethod: verifiedTransaction.paymentMethod,
                updatedAt: new Date(),
              },
            });

            if (claimed.count !== 1) {
              return null;
            }

            const txPayment = await tx.payment.findUniqueOrThrow({
              where: { providerTxnId: transactionId },
            });

            // Grant energy credits
            const premiumExpiry = new Date("9999-12-31T23:59:59.999Z");
            const packageName =
              (txPayment.metadata as { packageName?: string })?.packageName ||
              "Energy Booster";

            await tx.$executeRaw`
              INSERT INTO "UserCredit" ("id", "userId", "amount", "inputTokens", "outputTokens", "reason", "expiresAt", "createdAt")
              VALUES (
                ${`c${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`},
                ${txPayment.userId},
                ${txPayment.energyGranted},
                0,
                0,
                ${`Top-up: ${packageName}`.slice(0, 64)},
                ${premiumExpiry},
                NOW()
              )
            `;

            return {
              userId: txPayment.userId,
              energyGranted: txPayment.energyGranted,
              packageName,
            };
          });

          if (result) {
            logCreditTransaction({
              type: "credit",
              userId: result.userId,
              amount: result.energyGranted,
              reason: `Top-up: ${result.packageName}`,
              projectId: null,
            });
          }

          // eslint-disable-next-line no-console
          console.log(
            `[webhook] Successfully processed payment for providerTxnId: ${transactionId}`,
          );
          return Response.json({
            success: true,
            message: "Payment processed successfully.",
          });
        } catch (error) {
          console.error(
            `[webhook] Error processing webhook for providerTxnId ${transactionId}:`,
            error,
          );
          return Response.json(
            { message: "Internal server error processing webhook." },
            { status: 500 },
          );
        }
      },
    },
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test tests/routes/payment.test.ts -t "POST /api/payment/webhook"`
Expected: PASS, all cases including the new token-rejection, unknown-event,
amount-mismatch, and not-found cases.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.payment.webhook.ts tests/routes/payment.test.ts
git commit -m "feat: verify Mayar webhook token and correlate by transactionId"
```

---

## Task 6: `GET /api/payment/status/$orderId` — time-gated reconciliation

**Files:**
- Modify: `src/routes/api.payment.status.$orderId.ts`
- Modify: `tests/routes/payment.test.ts` (status describe block)

**Interfaces:**
- Consumes: `getMayarTransaction` from `@/lib/payment/mayar` (Task 3)
- Produces: no new exports; response shape unchanged
  (`{ success, orderId, status, amount, paymentMethod }`).

- [ ] **Step 1: Replace the status describe block in `tests/routes/payment.test.ts`**

Replace `describe("GET /api/payment/status/$orderId", ...)` (originally
lines 292–329) with:

```ts
  describe("GET /api/payment/status/$orderId", () => {
    it("requires login and protects against access of other user invoices", async () => {
      authMock.mockResolvedValueOnce({
        user: { id: "user_other" },
      });

      prismaPaymentFindUniqueMock.mockResolvedValueOnce({
        userId: "user_1",
        orderId: "INV-USER1-12345",
        amount: 2900,
        status: "PENDING",
        providerTxnId: "txn-1",
        createdAt: new Date(),
      });

      const res = await GET_STATUS(undefined, { orderId: "INV-USER1-12345" });
      expect(res.status).toBe(403);
    });

    it("returns correct payment status for owner without reconciling when recently created", async () => {
      authMock.mockResolvedValueOnce({
        user: { id: "user_1" },
      });

      prismaPaymentFindUniqueMock.mockResolvedValueOnce({
        userId: "user_1",
        orderId: "INV-USER1-12345",
        amount: 2900,
        status: "PENDING",
        paymentMethod: "qris",
        providerTxnId: "txn-1",
        createdAt: new Date(), // just created — inside the reconciliation grace window
      });

      const res = await GET_STATUS(undefined, { orderId: "INV-USER1-12345" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.status).toBe("PENDING");
      expect(getMayarTransactionMock).not.toHaveBeenCalled();
    });

    it("reconciles against Mayar directly when PENDING beyond the grace window", async () => {
      authMock.mockResolvedValueOnce({
        user: { id: "user_1" },
      });

      const oldCreatedAt = new Date(Date.now() - 3 * 60 * 1000); // 3 minutes ago
      prismaPaymentFindUniqueMock.mockResolvedValueOnce({
        userId: "user_1",
        orderId: "INV-USER1-12345",
        amount: 2900,
        status: "PENDING",
        paymentMethod: "qris",
        providerTxnId: "txn-1",
        createdAt: oldCreatedAt,
      });

      getMayarTransactionMock.mockResolvedValueOnce({
        status: "paid",
        amount: 2900,
        paymentMethod: "QRIS",
      });

      prismaPaymentUpdateManyMock.mockResolvedValueOnce({ count: 1 });
      prismaPaymentFindUniqueOrThrowMock.mockResolvedValueOnce({
        userId: "user_1",
        orderId: "INV-USER1-12345",
        amount: 2900,
        energyGranted: 50000,
        status: "COMPLETED",
        metadata: { packageName: "Pocket Booster" },
      });

      const res = await GET_STATUS(undefined, { orderId: "INV-USER1-12345" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(getMayarTransactionMock).toHaveBeenCalledWith("txn-1");
      expect(data.status).toBe("COMPLETED");
    });
  });
```

- [ ] **Step 2: Run the status tests to verify they fail**

Run: `bun run test tests/routes/payment.test.ts -t "GET /api/payment/status"`
Expected: FAIL — route doesn't reconcile, and the new test expects
`getMayarTransactionMock` to be called for a stale PENDING row.

- [ ] **Step 3: Rewrite `src/routes/api.payment.status.$orderId.ts`**

```ts
import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import { getMayarTransaction } from "@/lib/payment/mayar";
import { prisma } from "@/lib/prisma";
import { logCreditTransaction } from "@/lib/payment/user-credits";

// If a payment has been PENDING longer than this, the client is still
// polling but a webhook may never arrive (undocumented retry policy on
// Mayar's side) — reconcile directly against Mayar's API instead of waiting
// forever. Kept well above typical webhook latency to avoid burning through
// Mayar's 50 req/min rate limit on every poll tick.
const RECONCILE_AFTER_MS = 2 * 60 * 1000;

async function reconcilePendingPayment(payment: {
  orderId: string;
  amount: number;
  providerTxnId: string | null;
}) {
  if (!payment.providerTxnId) {
    return null;
  }

  const verified = await getMayarTransaction(payment.providerTxnId);

  if (verified.status !== "paid" || verified.amount !== payment.amount) {
    return null;
  }

  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { orderId: payment.orderId, status: "PENDING" },
      data: {
        status: "COMPLETED",
        paymentMethod: verified.paymentMethod,
        updatedAt: new Date(),
      },
    });

    if (claimed.count !== 1) {
      return null;
    }

    const txPayment = await tx.payment.findUniqueOrThrow({
      where: { orderId: payment.orderId },
    });

    const premiumExpiry = new Date("9999-12-31T23:59:59.999Z");
    const packageName =
      (txPayment.metadata as { packageName?: string })?.packageName ||
      "Energy Booster";

    await tx.$executeRaw`
      INSERT INTO "UserCredit" ("id", "userId", "amount", "inputTokens", "outputTokens", "reason", "expiresAt", "createdAt")
      VALUES (
        ${`c${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`},
        ${txPayment.userId},
        ${txPayment.energyGranted},
        0,
        0,
        ${`Top-up: ${packageName}`.slice(0, 64)},
        ${premiumExpiry},
        NOW()
      )
    `;

    return {
      userId: txPayment.userId,
      energyGranted: txPayment.energyGranted,
      packageName,
    };
  });

  if (result) {
    logCreditTransaction({
      type: "credit",
      userId: result.userId,
      amount: result.energyGranted,
      reason: `Top-up: ${result.packageName}`,
      projectId: null,
    });
  }

  return result;
}

export const Route = createFileRoute("/api/payment/status/$orderId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const session = await auth();

        if (!session?.user?.id) {
          return Response.json({ message: "Unauthorized." }, { status: 401 });
        }

        const { orderId } = params;

        if (!orderId) {
          return Response.json(
            { message: "Missing orderId parameter." },
            { status: 400 },
          );
        }

        try {
          const payment = await prisma.payment.findUnique({
            where: { orderId },
            select: {
              orderId: true,
              userId: true,
              amount: true,
              status: true,
              paymentMethod: true,
              providerTxnId: true,
              createdAt: true,
            },
          });

          if (!payment) {
            return Response.json(
              { message: "Payment not found." },
              { status: 404 },
            );
          }

          // Protect privacy: only the owner of the payment can read it
          if (payment.userId !== session.user.id) {
            return Response.json(
              { message: "Forbidden. You do not own this invoice." },
              { status: 403 },
            );
          }

          let status = payment.status;
          let paymentMethod = payment.paymentMethod;

          const isStalePending =
            status === "PENDING" &&
            Date.now() - payment.createdAt.getTime() > RECONCILE_AFTER_MS;

          if (isStalePending) {
            try {
              const reconciled = await reconcilePendingPayment(payment);
              if (reconciled) {
                status = "COMPLETED";
                paymentMethod = "qris";
              }
            } catch (error) {
              // Reconciliation failure shouldn't break status polling —
              // log and fall through to the last-known DB status.
              console.warn(
                `[payment-status] Reconciliation failed for ${orderId}:`,
                error,
              );
            }
          }

          return Response.json({
            success: true,
            orderId: payment.orderId,
            status,
            amount: payment.amount,
            paymentMethod,
          });
        } catch (error) {
          console.error(
            `[payment-status] Error fetching order status for ${orderId}:`,
            error,
          );
          return Response.json(
            { message: "Internal server error fetching status." },
            { status: 500 },
          );
        }
      },
    },
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test tests/routes/payment.test.ts -t "GET /api/payment/status"`
Expected: PASS.

- [ ] **Step 5: Run the full payment.test.ts file to confirm no regressions**

Run: `bun run test tests/routes/payment.test.ts`
Expected: PASS, all describe blocks.

- [ ] **Step 6: Commit**

```bash
git add src/routes/api.payment.status.\$orderId.ts tests/routes/payment.test.ts
git commit -m "feat: reconcile stale PENDING payments directly against Mayar"
```

---

## Task 7: Admin manual-verify route — switch to Mayar

**Files:**
- Modify: `src/routes/api.admin.transactions.$orderId.verify.ts`
- Create: `tests/routes/admin-transactions-verify.test.ts`

**Interfaces:**
- Consumes: `getMayarTransaction` from `@/lib/payment/mayar` (Task 3)

- [ ] **Step 1: Write the failing tests**

Create `tests/routes/admin-transactions-verify.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminMock,
  getMayarTransactionMock,
  prismaPaymentFindUniqueMock,
  prismaPaymentUpdateMock,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  getMayarTransactionMock: vi.fn(),
  prismaPaymentFindUniqueMock: vi.fn(),
  prismaPaymentUpdateMock: vi.fn(),
}));

vi.mock("@/lib/auth/auth-admin", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/payment/mayar", () => ({
  getMayarTransaction: getMayarTransactionMock,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: {
      findUnique: prismaPaymentFindUniqueMock,
      update: prismaPaymentUpdateMock,
    },
  },
}));

import { getHandler } from "./_handler";

import { Route } from "@/routes/api.admin.transactions.$orderId.verify";

const POST = getHandler(Route, "POST");

describe("POST /api/admin/transactions/$orderId/verify", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    requireAdminMock.mockResolvedValue({ ok: true });
    getMayarTransactionMock.mockReset();
    prismaPaymentFindUniqueMock.mockReset();
    prismaPaymentUpdateMock.mockReset();
  });

  it("rejects non-admins", async () => {
    requireAdminMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      message: "Forbidden.",
    });

    const res = await POST(undefined, { orderId: "INV-1" });
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown orderId", async () => {
    prismaPaymentFindUniqueMock.mockResolvedValueOnce(null);

    const res = await POST(undefined, { orderId: "INV-missing" });
    expect(res.status).toBe(404);
  });

  it("short-circuits non-PENDING payments without calling Mayar", async () => {
    prismaPaymentFindUniqueMock.mockResolvedValueOnce({
      amount: 2900,
      status: "COMPLETED",
      providerTxnId: "txn-1",
    });

    const res = await POST(undefined, { orderId: "INV-1" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("COMPLETED");
    expect(getMayarTransactionMock).not.toHaveBeenCalled();
  });

  it("returns a clear error for legacy Pakasir rows with no providerTxnId", async () => {
    prismaPaymentFindUniqueMock.mockResolvedValueOnce({
      amount: 2900,
      status: "PENDING",
      providerTxnId: null,
    });

    const res = await POST(undefined, { orderId: "INV-legacy" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toContain("pre-migration");
  });

  it("verifies via Mayar and updates status for a PENDING row", async () => {
    prismaPaymentFindUniqueMock.mockResolvedValueOnce({
      amount: 2900,
      status: "PENDING",
      providerTxnId: "txn-1",
    });
    getMayarTransactionMock.mockResolvedValueOnce({
      status: "paid",
      amount: 2900,
      paymentMethod: "QRIS",
    });

    const res = await POST(undefined, { orderId: "INV-1" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("PAID");
    expect(getMayarTransactionMock).toHaveBeenCalledWith("txn-1");
    expect(prismaPaymentUpdateMock).toHaveBeenCalledWith({
      where: { orderId: "INV-1" },
      data: { status: "PAID" },
    });
  });

  it("returns 502 when the Mayar verification call fails", async () => {
    prismaPaymentFindUniqueMock.mockResolvedValueOnce({
      amount: 2900,
      status: "PENDING",
      providerTxnId: "txn-1",
    });
    getMayarTransactionMock.mockRejectedValueOnce(new Error("network error"));

    const res = await POST(undefined, { orderId: "INV-1" });
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test tests/routes/admin-transactions-verify.test.ts`
Expected: FAIL — route still imports `verifyPakasirTransaction` and has no
`providerTxnId`/legacy-row branch.

- [ ] **Step 3: Rewrite `src/routes/api.admin.transactions.$orderId.verify.ts`**

```ts
import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth/auth-admin";
import { getMayarTransaction } from "@/lib/payment/mayar";
import { prisma } from "@/lib/prisma";

export const Route = createFileRoute("/api/admin/transactions/$orderId/verify")(
  {
    server: {
      handlers: {
        POST: async ({ params }) => {
          const admin = await requireAdmin();
          if (!admin.ok) {
            return Response.json(
              { message: admin.message },
              { status: admin.status },
            );
          }
          const payment = await prisma.payment.findUnique({
            where: { orderId: params.orderId },
            select: { amount: true, status: true, providerTxnId: true },
          });
          if (!payment) {
            return Response.json(
              { message: "Transaksi tidak ditemukan." },
              { status: 404 },
            );
          }
          if (payment.status !== "PENDING") {
            return Response.json({
              status: payment.status,
              message: "Hanya transaksi pending yang bisa diverifikasi.",
            });
          }
          if (!payment.providerTxnId) {
            return Response.json(
              {
                message:
                  "Transaksi ini adalah pembayaran pre-migration (Pakasir) dan tidak bisa diverifikasi lewat Mayar.",
              },
              { status: 400 },
            );
          }
          try {
            const detail = await getMayarTransaction(payment.providerTxnId);
            const newStatus = detail.status.toUpperCase();
            await prisma.payment.update({
              where: { orderId: params.orderId },
              data: { status: newStatus },
            });
            return Response.json({ status: newStatus });
          } catch {
            return Response.json(
              { message: "Gagal verifikasi via Mayar." },
              { status: 502 },
            );
          }
        },
      },
    },
  },
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test tests/routes/admin-transactions-verify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.admin.transactions.\$orderId.verify.ts tests/routes/admin-transactions-verify.test.ts
git commit -m "feat: verify admin manual transactions against Mayar"
```

---

## Task 8: `EnergyBoosterModal.tsx` — hosted-link checkout UI

**Files:**
- Modify: `src/components/payment/EnergyBoosterModal.tsx`
- Modify (if exists): `src/components/payment/EnergyBoosterModal.stories.tsx`
  — check for this file's existence in Step 1 before assuming its content.

**Interfaces:**
- Consumes: `POST /api/payment/create` response shape
  `{ success, orderId, amount, paymentUrl, status }` (Task 4)

- [ ] **Step 1: Check for an existing Storybook story**

```bash
find src/components/payment -iname "*.stories.*"
```

If a story file exists, read it before Step 3 so the UI changes below stay
consistent with its mocked fixtures.

- [ ] **Step 2: Manual verification plan (no automated test for this component)**

This component has no existing unit test (`EnergyBoosterModal.tsx` has no
matching `.test.tsx` in the repo) — this task's verification is manual, via
`bun run dev` plus the Storybook story if one exists. Do not invent a new
automated test file for this step; follow the project's existing testing
boundary (routes get Vitest route tests, this modal gets Storybook +
manual).

- [ ] **Step 3: Update `EnergyBoosterModal.tsx`**

Three changes to the existing file:

1. Line 19 — import from `@/lib/payment/mayar` instead of `@/lib/pakasir`:

```ts
import { BOOSTER_PACKS, type BoosterPackId } from "@/lib/payment/mayar";
```

2. Replace the `PaymentSession` type (lines 28–34) and remove `getQRUrl`
   (lines 158–160):

```ts
type PaymentSession = {
  success: boolean;
  orderId: string;
  amount: number;
  paymentUrl: string;
  status: string;
};
```

3. Replace the PENDING-state JSX block (lines 285–324) — the inline
   `<img>` QR code becomes a link button that opens Mayar's hosted checkout:

```tsx
{paymentStatus === "PENDING" && (
  <>
    <span className="text-xs text-[#ff7a59] font-bold uppercase tracking-widest animate-pulse">
      Menunggu Pembayaran
    </span>
    <a
      href={paymentSession.paymentUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 rounded-radius-lg bg-[#fcfbf8] px-6 py-3 text-sm font-bold text-[#1c1c1c] transition duration-200 hover:bg-[#eceae4] active:scale-[0.98] cursor-pointer"
    >
      <CreditCardIcon className="size-4" />
      <span>Bayar Sekarang (QRIS)</span>
    </a>
    {isDev && (
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(paymentSession.orderId);
          toast.success("Order ID copied to clipboard!");
        }}
        className="rounded border border-dashed border-white/20 bg-white/5 px-2.5 py-1 text-[10px] text-surface-warm-white/70 font-mono hover:bg-white/10 transition cursor-pointer select-all"
      >
        Dev Order ID: {paymentSession.orderId} (Click to copy)
      </button>
    )}
    <div className="flex flex-col gap-1">
      <span className="text-xs text-surface-warm-white/50">
        Total Pembayaran:
      </span>
      <span className="text-lg font-bold text-[#f7a441]">
        {formatRupiah(paymentSession.amount)}
      </span>
      <span className="text-[10px] text-surface-warm-white/40 max-w-xs leading-normal mt-2">
        Klik tombol di atas untuk membuka halaman pembayaran QRIS. Setelah
        membayar, kembali ke sini — status akan diperbarui otomatis.
      </span>
    </div>
  </>
)}
```

Also remove the now-unused `getQRUrl` function (previously lines 158–160).

- [ ] **Step 4: Update the `handleBuy` request body**

The create request no longer sends a `method` field (Task 4's route dropped
the `method` param since QRIS is the only channel). Update line ~139:

```ts
body: JSON.stringify({ packageId: packId }),
```

- [ ] **Step 5: Manually verify in the browser**

```bash
bun run dev
```

Open the app, trigger the Energy Booster modal, select a pack, click "Bayar
Sekarang (QRIS)". Confirm:
- The create call succeeds and shows the PENDING state with a working link
  button (not a broken inline QR image).
- Clicking the button opens Mayar's hosted checkout page in a new tab.
- The Dev Order ID copy button still works.

- [ ] **Step 6: Update or create the Storybook story if one exists**

If Step 1 found a story file, update its mocked `paymentSession` fixture
from `paymentNumber` to `paymentUrl` so the story doesn't crash. If no story
file exists, do not create one — this is a pre-existing gap outside this
task's scope; note it in the final report but don't fix it here (surgical
edits only, per project conventions).

- [ ] **Step 7: Run the fast quality gate**

```bash
bun run check
```

Expected: format/lint/typecheck/test:changed/Knip all pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/payment/EnergyBoosterModal.tsx
git commit -m "feat: switch booster checkout to Mayar hosted QRIS link"
```

---

## Task 9: `user-facing-error.ts` — update the error-mapping regex

**Files:**
- Modify: `src/lib/user-facing-error.ts`
- Modify: `src/lib/user-facing-error.test.ts`

**Interfaces:**
- No exported signature changes — `mapToUserFacingError(reason: string): string`
  stays the same.

- [ ] **Step 1: Check the existing test for a Pakasir-specific case**

```bash
grep -n "pakasir" src/lib/user-facing-error.test.ts
```

- [ ] **Step 2: Update (or add) the failing test**

If a test asserts a `"pakasir ..."` reason maps to the payment-failure
message, update it to assert `"mayar ..."` instead. If no such case exists,
add one to `src/lib/user-facing-error.test.ts`:

```ts
it("maps mayar-related errors to the Indonesian payment-failure message", () => {
  expect(mapToUserFacingError("Mayar create payment failed with status 500")).toBe(
    "Pembayaran gagal. Coba lagi.",
  );
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun run test src/lib/user-facing-error.test.ts`
Expected: FAIL — current regex is `/pakasir|payment|transaction failed/i`,
which still matches "payment" so this specific test may actually pass
already. Check: if it passes without changes, skip Step 4 and go straight
to Step 5's regex update for consistency, then re-verify.

- [ ] **Step 4: Update the regex in `src/lib/user-facing-error.ts`**

```ts
{
  match: /mayar|payment|transaction failed/i,
  message: "Pembayaran gagal. Coba lagi.",
},
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test src/lib/user-facing-error.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/user-facing-error.ts src/lib/user-facing-error.test.ts
git commit -m "refactor: rename Pakasir reference to Mayar in error mapping"
```

---

## Task 10: `scripts/simulate-payment.ts` — retarget to Mayar sandbox

**Files:**
- Modify: `scripts/simulate-payment.ts`

**Interfaces:**
- Consumes: `createMayarPayment`, `BOOSTER_PACKS` from `@/lib/payment/mayar` (Task 3)

No sandbox-simulate endpoint was found in Mayar's public API docs (unlike
Pakasir's `/api/paymentsimulation`, which completes a payment instantly
without a real scan). Task 1's spike findings should confirm whether the
sandbox hosted-link page offers a "simulate" control. This task creates a
payment and prints the link for the developer to open and pay manually.

- [ ] **Step 1: Rewrite `scripts/simulate-payment.ts`**

```ts
/* eslint-disable no-console */
import readline from "node:readline";

import { BOOSTER_PACKS, createMayarPayment } from "../src/lib/mayar";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string): Promise<string> =>
  new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log("\n=== MAYAR PAYMENT SIMULATION CLI (sandbox) ===");

  const apiKey = process.env.MAYAR_API_KEY;
  const baseUrl = process.env.MAYAR_API_BASE_URL;

  if (!apiKey || !baseUrl) {
    console.error(
      "Error: Missing MAYAR_API_KEY or MAYAR_API_BASE_URL in environment variables.",
    );
    rl.close();
    process.exit(1);
  }

  if (!baseUrl.includes("mayar.club")) {
    console.error(
      "Error: MAYAR_API_BASE_URL does not look like the sandbox host " +
        "(api.mayar.club). Refusing to run against what looks like production.",
    );
    rl.close();
    process.exit(1);
  }

  const orderId = await question(
    "Enter Order/Invoice ID (e.g. INV-ABCD-172138): ",
  );
  if (!orderId.trim()) {
    console.error("Error: Order ID is required.");
    rl.close();
    process.exit(1);
  }

  console.log("\nSelect Package:");
  const packs = Object.entries(BOOSTER_PACKS);
  packs.forEach(([, pack], index) => {
    console.log(
      `${index + 1}. ${pack.name} (Rp ${pack.amount.toLocaleString("id-ID")})`,
    );
  });
  console.log(`${packs.length + 1}. Enter custom amount`);

  const choiceStr = await question(`Choose option (1-${packs.length + 1}): `);
  const choice = parseInt(choiceStr.trim(), 10);

  let amount = 0;
  let packName = "Simulation Payment";
  if (choice >= 1 && choice <= packs.length) {
    const [, pack] = packs[choice - 1];
    amount = pack.amount;
    packName = pack.name;
  } else if (choice === packs.length + 1) {
    const customAmountStr = await question("Enter custom amount (e.g. 5000): ");
    amount = parseInt(customAmountStr.trim(), 10);
  } else {
    console.error("Error: Invalid option chosen.");
    rl.close();
    process.exit(1);
  }

  if (isNaN(amount) || amount <= 0) {
    console.error("Error: Payment amount must be a positive integer.");
    rl.close();
    process.exit(1);
  }

  console.log(`\nCreating sandbox payment request:`);
  console.log(`- Order ID: ${orderId}`);
  console.log(`- Amount: Rp ${amount.toLocaleString("id-ID")}`);

  try {
    const payment = await createMayarPayment({
      orderId: orderId.trim(),
      amount,
      packName,
    });

    console.log("\n✅ Payment request created in Mayar sandbox!");
    console.log(`- transactionId: ${payment.transactionId}`);
    console.log(`- Open this link to pay: ${payment.link}`);
    console.log(
      "\nAfter paying, check your dev server logs or the local webhook " +
        "history in the Mayar sandbox dashboard for the delivered webhook.",
    );
  } catch (error) {
    console.error("\n❌ Failed to create sandbox payment:", error);
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  rl.close();
});
```

- [ ] **Step 2: Manually run it against sandbox**

```bash
bun scripts/simulate-payment.ts
```

Follow the prompts, open the printed link, pay it, confirm the dev server
receives and correctly processes the webhook (energy granted, payment
status flips to COMPLETED).

- [ ] **Step 3: Commit**

```bash
git add scripts/simulate-payment.ts
git commit -m "refactor: retarget simulate-payment script to Mayar sandbox"
```

---

## Task 11: Cutover — delete Pakasir, swap to production credentials

Do not start this task until:
- All previous tasks are committed and `bun run verify` is green.
- Mayar production KYC has been approved (checked manually — no code
  signal for this).

**Files:**
- Delete: `src/lib/pakasir.ts`
- Delete: `src/lib/pakasir.test.ts` (if it exists — check first)
- Modify: `.env.example`
- Modify: `CHANGELOG.md`

**Interfaces:** none — this is a pure deletion/cutover task.

- [ ] **Step 1: Confirm no remaining references to Pakasir in source**

```bash
grep -rln "pakasir\|Pakasir\|PAKASIR" --include="*.ts" --include="*.tsx" src/ scripts/ tests/ 2>/dev/null
```

Expected: only `src/lib/pakasir.ts` itself (and its test file, if any) —
every call site should already be migrated by Tasks 3–10. If anything else
appears, stop and fix it before continuing.

- [ ] **Step 2: Delete the Pakasir client and its test**

```bash
git rm src/lib/pakasir.ts
git rm src/lib/pakasir.test.ts 2>/dev/null || true
```

- [ ] **Step 3: Remove Pakasir vars from `.env.example`**

Remove these two lines (currently right before the Mayar block):

```
# ── PAYMENT (Pakasir) ──
PAKASIR_API_KEY=""
PAKASIR_PROJECT_SLUG=""
```

- [ ] **Step 4: Drain in-flight Pakasir PENDING rows**

Before deploying, check for any `Payment` rows still `PENDING` with a
`paymentNumber` set and `providerTxnId` null (legacy Pakasir rows). These
can no longer be verified once Pakasir credentials are removed. Either:
(a) confirm via the admin dashboard they've already settled/expired, or
(b) manually mark them `FAILED` if abandoned.

```sql
SELECT "orderId", "amount", "createdAt"
FROM "Payment"
WHERE "status" = 'PENDING' AND "providerTxnId" IS NULL;
```

- [ ] **Step 5: Update `.env` on the production host with Mayar production credentials**

This is a manual, out-of-repo step: set `MAYAR_API_KEY` (production Read &
Write key), `MAYAR_API_BASE_URL=https://api.mayar.id/hl/v2`, and
`MAYAR_WEBHOOK_TOKEN` (production account's token) in the production
environment. Register `https://umkmcepat.com/api/payment/webhook` as the
webhook URL in the production Mayar dashboard.

- [ ] **Step 6: Run the full verify gate**

```bash
bun run verify
```

Expected: locks, route regen, format/lint/typecheck/full tests/Knip all
pass with `src/lib/pakasir.ts` gone.

- [ ] **Step 7: Update `CHANGELOG.md`**

Add an entry under today's date following the existing terse, one-line-item
style (see prior entries for tone):

```markdown
### 2026-07-29 — Payment provider migration: Pakasir -> Mayar

- **QRIS provider swap**: Energy Booster top-ups now go through Mayar.id instead of Pakasir. Checkout opens Mayar's hosted QRIS payment link instead of an inline QR image (removes a third-party `api.qrserver.com` call). Webhook requests are verified against a dashboard-issued token before any payload is trusted, then re-verified against Mayar's transaction API (status + exact amount) before crediting — same defense-in-depth pattern as the old Pakasir integration. `Payment` gained `providerTxnId`/`providerPaymentLinkId`/`paymentUrl`; `paymentNumber` is kept read-only for historical Pakasir rows.
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: complete cutover from Pakasir to Mayar

Removes the Pakasir client and env vars now that the Mayar
integration has been verified end-to-end in sandbox and production
KYC is approved.
EOF
)"
```

- [ ] **Step 9: Deploy and smoke-test**

Deploy per the project's normal deploy process. Immediately after, make one
small real payment (the cheapest pack) end-to-end and confirm: payment
link opens, QRIS scans, webhook fires, energy credits, status flips to
COMPLETED in the UI.

---

## Self-review notes

- **Spec coverage:** every section of the design spec maps to a task —
  provider client (Task 3), schema (Task 2), create/webhook/status/admin
  routes (Tasks 4–7), UI (Task 8), blast-radius files (Tasks 9–10), cutover
  sequence (Task 11), and the six open questions (Task 1, gating everything
  downstream).
- **Type consistency:** `getMayarTransaction` returns
  `{ status, amount, paymentMethod }` consistently across Tasks 3, 5, 6, 7.
  `createMayarPayment` returns `{ id, transactionId, link }` consistently
  across Tasks 3 and 4. `providerTxnId` is the correlation key used
  identically in Tasks 2, 4, 5, 6, 7.
- **Task 1 is a hard dependency for Tasks 3, 5, 6, 10** — if the spike
  finds the webhook token is NOT a simple header match, or `transactionId`
  does not survive to the webhook payload, stop and revise those tasks'
  code before implementing them as written.

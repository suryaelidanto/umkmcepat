# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the seven in-scope findings from the deep security audit: preview-iframe sandbox bypass (CRITICAL), spoofable rate-limit IP (CRITICAL), hardcoded temp-image signing secret, disconnected Turnstile CAPTCHA, raw error-message leaks, misleading preview CORS comment, and CI secret/action hygiene.

**Architecture:** (1) Remove `allow-same-origin` from both the workspace preview iframe attribute and the private-preview CSP so generated content runs on an opaque origin; (2) resolve rate-limit client IP from `cf-connecting-ip` → last `x-forwarded-for` hop → `x-real-ip` with shape validation; (3) sign temp-image tokens with `NEXTAUTH_SECRET` (fail-closed in production); (4) gate Auth.js signin initiation server-side via a short-lived HMAC-signed `umkm_turnstile_verified` cookie issued by the existing `/api/auth/turnstile` endpoint; (5) route seven error-leak sites through the existing `mapToUserFacingError`; (6) correct the preview CORS comment; (7) CI `DEPLOY_PATH` via `envs:` + SHA-pin `quality.yml` actions.

**Tech Stack:** Bun, TypeScript, Vitest, TanStack Start, Auth.js Core (`@auth/core`), GitHub Actions. No new dependencies, no new env vars.

**Spec:** `docs/superpowers/specs/2026-08-06-security-hardening-design.md`

## Global Constraints

- No new env vars; `.env`/`.env.example` stay 1:1. `NEXTAUTH_SECRET` already exists and is already required in production.
- No new dependencies.
- Happy-path behavior unchanged; only error paths and the sandbox isolation change.
- User-facing product copy Indonesian; code/comments/logs English.
- TDD: write/extend the test, watch it fail, implement, watch it pass. `bun run check` green per task.
- Focused test command: `bunx vitest run --project unit <file>`; full gate: `bun run check`.
- Work from `dev`; conventional commits, one per task.

---

## File Structure

- **Modify** `src/lib/security-headers.ts` — privatePreview CSP: drop `allow-same-origin`.
- **Modify** `src/lib/security-headers.test.ts` — update the private-preview CSP expectation.
- **Modify** `src/components/projects/WorkspacePrimitives.tsx` — iframe `sandbox` attribute + stale comment.
- **Modify** `src/lib/rate-limit.ts` — `getClientIp` resolution order + plausibility check; export it.
- **Modify** `src/lib/rate-limit.test.ts` — `getClientIp` branch tests.
- **Modify** `src/lib/uploads/temp-image-token.ts` — `getSecret` from `NEXTAUTH_SECRET`, prod fail-closed.
- **Modify** `src/lib/uploads/temp-image-token.test.ts` — secret-resolution tests.
- **Create** `src/lib/turnstile-gate.ts` — signed-cookie issue/verify helpers.
- **Create** `src/lib/turnstile-gate.test.ts`.
- **Modify** `src/routes/api.auth.turnstile.ts` — set the cookie on success.
- **Modify** `src/routes/api.auth.$.ts` — gate POST `/api/auth/signin/<provider>`.
- **Modify** `tests/routes/auth.turnstile.test.ts` — assert the `Set-Cookie` header.
- **Modify** `src/lib/user-facing-error.ts` — extend `KNOWN` with benign temp-image messages.
- **Modify** `src/lib/user-facing-error.test.ts` — new mappings.
- **Modify** `src/routes/api.uploads.temp-images.ts`, `src/routes/api.support.tickets.ts`, `src/routes/api.support.tickets.$ticketId.ts`, `src/routes/api.support.tickets.$ticketId.resolve.ts`, `src/routes/api.admin.tickets.$ticketId.reply.ts`, `src/routes/api.admin.tickets.$ticketId.resolve.ts`, `src/routes/api.projects.$id.generate.ts` — route errors through `mapToUserFacingError`.
- **Modify** `src/lib/projects/runtime-proxy.ts` — replace the false CORS comment.
- **Modify** `.github/workflows/deploy.yml`, `.github/workflows/quality.yml` — secret via `envs:`, SHA-pinned actions.

---

### Task 1: Remove `allow-same-origin` from the preview iframe sandbox (CRITICAL)

**Files:**
- Modify: `src/lib/security-headers.ts` (privatePreview CSP, line 161)
- Modify: `src/lib/security-headers.test.ts:102-116`
- Modify: `src/components/projects/WorkspacePrimitives.tsx:845` + comment at `:724-726`

**Interfaces:** N/A — string + attribute swap. Behavior contract: the workspace preview iframe becomes an opaque origin; the parent's `handleMessage` already accepts ready/annotation signals by `event.data.type` alone, so the bridge is unaffected. `<img>`/`<script>`/`<link>` subresources are not CORS-restricted and keep loading.

- [ ] **Step 1: Update the failing test expectation**

In `src/lib/security-headers.test.ts`, replace the expected private-preview CSP (`:109-111`):

```ts
    expect(headers.get("Content-Security-Policy")).toBe(
      "sandbox allow-scripts; frame-ancestors 'self'; object-src 'none'; base-uri 'none'",
    );
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run --project unit src/lib/security-headers.test.ts`
Expected: FAIL — actual CSP still contains `sandbox allow-scripts allow-same-origin; ...`.

- [ ] **Step 3: Drop `allow-same-origin` from the privatePreview CSP**

In `src/lib/security-headers.ts` (`privatePreview` branch), replace:

```ts
      "sandbox allow-scripts allow-same-origin; frame-ancestors 'self'; object-src 'none'; base-uri 'none'",
```

with:

```ts
      "sandbox allow-scripts; frame-ancestors 'self'; object-src 'none'; base-uri 'none'",
```

- [ ] **Step 4: Drop `allow-same-origin` from the iframe attribute + fix the comment**

In `src/components/projects/WorkspacePrimitives.tsx:845`, replace:

```tsx
          sandbox="allow-scripts allow-same-origin allow-forms"
```

with:

```tsx
          sandbox="allow-scripts allow-forms"
```

Then fix the stale comment block (`:724-726`). Replace:

```ts
      // Sandbox "allow-scripts" (no allow-same-origin) makes the iframe
      // cross-origin, so event.source is null/window proxy and a strict
      // equality check always fails. Validate by message type + origin
      // instead so the preview-ready signal actually reaches us.
```

with:

```ts
      // Sandboxed WITHOUT allow-same-origin (deliberate — see security
      // hardening spec): the iframe is an opaque origin, so event.source is
      // null/window proxy and a strict equality check always fails. Validate
      // by message type so the preview-ready signal actually reaches us.
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bunx vitest run --project unit src/lib/security-headers.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [ ] **Step 7: Verify the preview end-to-end (manual)**

Run `bun run dev` (infra up: `bun run infra`), sign in, open a project with a generated build in the workspace. Confirm: (a) the preview iframe loads the site, (b) the loading spinner clears (ready signal via `postMessage`), (c) annotation/komentar targeting responds, (d) images render. If (a)–(d) all pass, the opaque-origin change is behavior-compatible. If anything breaks, do NOT re-add `allow-same-origin` — fix the specific broken path (e.g. a `fetch` in generated code would need the preview proxy's existing `Access-Control-Allow-Origin: *`, which is already in place for exactly this case).

- [ ] **Step 8: Commit**

```bash
git add src/lib/security-headers.ts src/lib/security-headers.test.ts src/components/projects/WorkspacePrimitives.tsx
git commit -m "fix(security): remove allow-same-origin from preview iframe sandbox"
```

---

### Task 2: Rate-limit client IP from trusted sources (CRITICAL)

**Files:**
- Modify: `src/lib/rate-limit.ts:40-47` (replace `getClientIp`, export it, add `isPlausibleIp`)
- Test: `src/lib/rate-limit.test.ts`

**Interfaces:**
- Produces: `export function getClientIp(request: Request): string` — resolution order `cf-connecting-ip` → last `x-forwarded-for` hop → `x-real-ip` → `"127.0.0.1"`; every candidate must pass `isPlausibleIp` (≤45 chars, `[0-9a-fA-F:.]` only). Consumed by `checkRateLimit` exactly as today.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/rate-limit.test.ts` (import `getClientIp` from `@/lib/rate-limit`):

```ts
describe("getClientIp", () => {
  it("prefers cf-connecting-ip when present (Cloudflare sets it, spoofing cannot)", () => {
    const request = new Request("http://localhost/", {
      headers: {
        "cf-connecting-ip": "203.0.113.7",
        "x-forwarded-for": "1.2.3.4, 198.51.100.9",
        "x-real-ip": "10.0.0.1",
      },
    });
    expect(getClientIp(request)).toBe("203.0.113.7");
  });

  it("uses the LAST x-forwarded-for hop, ignoring attacker-supplied leading hops", () => {
    const request = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "6.6.6.6, 7.7.7.7, 203.0.113.99" },
    });
    expect(getClientIp(request)).toBe("203.0.113.99");
  });

  it("falls back to x-real-ip", () => {
    const request = new Request("http://localhost/", {
      headers: { "x-real-ip": "198.51.100.4" },
    });
    expect(getClientIp(request)).toBe("198.51.100.4");
  });

  it("falls back to 127.0.0.1 when no header is present", () => {
    expect(getClientIp(new Request("http://localhost/"))).toBe("127.0.0.1");
  });

  it("ignores implausible values (e.g. path traversal strings)", () => {
    const request = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "../../etc/passwd" },
    });
    expect(getClientIp(request)).toBe("127.0.0.1");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run --project unit src/lib/rate-limit.test.ts`
Expected: FAIL — `getClientIp` is not exported (import error) or returns the first XFF hop.

- [ ] **Step 3: Implement**

In `src/lib/rate-limit.ts`, replace the `getClientIp` function (`:40-46`) and make it exported:

```ts
function isPlausibleIp(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }
  return value.length <= 45 && /^[0-9a-fA-F:.]+$/.test(value);
}

export function getClientIp(request: Request): string {
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (isPlausibleIp(cfConnectingIp)) {
    return cfConnectingIp;
  }

  // Cloudflare appends the real client IP as the LAST hop and preserves any
  // client-supplied leading hops; the leading entries are attacker-controlled
  // and must never be trusted for rate limiting.
  const forwardedFor = request.headers.get("x-forwarded-for");
  const lastHop = forwardedFor?.split(",").at(-1)?.trim();
  if (isPlausibleIp(lastHop)) {
    return lastHop;
  }

  const realIp = request.headers.get("x-real-ip");
  if (isPlausibleIp(realIp)) {
    return realIp;
  }

  return "127.0.0.1";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run --project unit src/lib/rate-limit.test.ts`
Expected: PASS (existing tests + the five new ones).

- [ ] **Step 5: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/rate-limit.ts src/lib/rate-limit.test.ts
git commit -m "fix(security): rate-limit IP from cf-connecting-ip / last XFF hop"
```

---

### Task 3: Temp-image token signs with the real secret (MEDIUM)

**Files:**
- Modify: `src/lib/uploads/temp-image-token.ts:13-15` (`getSecret`)
- Test: `src/lib/uploads/temp-image-token.test.ts`

**Interfaces:** unchanged — `signTempImageToken(payload)`, `verifyTempImageToken(token)`. Behavior change: production with no `NEXTAUTH_SECRET`/`AUTH_SECRET` throws instead of silently using `"dev-secret"`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/uploads/temp-image-token.test.ts`:

```ts
describe("temp image token secret resolution", () => {
  const envNames = ["NEXTAUTH_SECRET", "AUTH_SECRET"] as const;
  const previous = Object.fromEntries(
    envNames.map((name) => [name, process.env[name]]),
  );
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    for (const name of envNames) {
      const value = previous[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    process.env.NODE_ENV = previousNodeEnv;
  });

  it("signs and verifies with NEXTAUTH_SECRET", () => {
    process.env.NEXTAUTH_SECRET = "a-real-secret-that-is-long-enough-1234";
    delete process.env.AUTH_SECRET;

    const token = signTempImageToken(payload);
    expect(verifyTempImageToken(token)).toEqual(payload);
  });

  it("rejects a token signed with a different secret (signature is meaningful)", () => {
    process.env.NEXTAUTH_SECRET = "secret-one-that-is-long-enough-1234";
    const token = signTempImageToken(payload);

    process.env.NEXTAUTH_SECRET = "secret-two-that-is-long-enough-5678";
    expect(verifyTempImageToken(token)).toBeNull();
  });

  it("throws in production when no secret is configured", () => {
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.AUTH_SECRET;
    process.env.NODE_ENV = "production";

    expect(() => signTempImageToken(payload)).toThrow(
      /NEXTAUTH_SECRET.*required in production/,
    );
  });

  it("keeps the dev fallback outside production", () => {
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.AUTH_SECRET;
    process.env.NODE_ENV = "test";

    const token = signTempImageToken(payload);
    expect(verifyTempImageToken(token)).toEqual(payload);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run --project unit src/lib/uploads/temp-image-token.test.ts`
Expected: FAIL — the "rejects a token signed with a different secret" case passes today only because the secret never changes (always `"dev-secret"`), and the production-throw case throws nothing.

- [ ] **Step 3: Implement**

In `src/lib/uploads/temp-image-token.ts`, replace `getSecret` (`:13-15`):

```ts
function getSecret() {
  const configured = getEnv("NEXTAUTH_SECRET") || getEnv("AUTH_SECRET");
  if (configured) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "A temp-image signing secret (NEXTAUTH_SECRET) is required in production.",
    );
  }
  return "dev-secret";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run --project unit src/lib/uploads/temp-image-token.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/uploads/temp-image-token.ts src/lib/uploads/temp-image-token.test.ts
git commit -m "fix(security): temp-image token signs with NEXTAUTH_SECRET, prod fail-closed"
```

---

### Task 4: Enforce Turnstile server-side on signin (MEDIUM)

**Files:**
- Create: `src/lib/turnstile-gate.ts`
- Create: `src/lib/turnstile-gate.test.ts`
- Modify: `src/routes/api.auth.turnstile.ts` (set cookie on success)
- Modify: `src/routes/api.auth.$.ts` (gate POST `/api/auth/signin/<provider>`)
- Modify: `tests/routes/auth.turnstile.test.ts` (assert `Set-Cookie`)

**Interfaces:**
- Produces:
  - `TURNSTILE_VERIFIED_COOKIE: string` — `"umkm_turnstile_verified"`.
  - `TURNSTILE_GRACE_MS: number` — `10 * 60 * 1000`.
  - `createTurnstileVerifiedValue(now?: number): string` — `v1.<issuedAtSeconds base36>.<uuid>.<sig>`.
  - `verifyTurnstileVerification(request: Request, now?: number): boolean` — constant-time, grace-window-bound.
  - `turnstileVerifiedCookie(secure: boolean, now?: number): string` — full `Set-Cookie` value.
- Consumes: nothing from earlier tasks. The cookie name/verifier are consumed by `api.auth.turnstile.ts` and `api.auth.$.ts` in this task.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/turnstile-gate.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";

import {
  createTurnstileVerifiedValue,
  turnstileVerifiedCookie,
  TURNSTILE_VERIFIED_COOKIE,
  verifyTurnstileVerification,
} from "@/lib/turnstile-gate";

const envNames = ["NEXTAUTH_SECRET", "AUTH_SECRET"] as const;
const previous = Object.fromEntries(
  envNames.map((name) => [name, process.env[name]]),
);
const previousNodeEnv = process.env.NODE_ENV;

function requestWithCookie(value: string): Request {
  return new Request("http://localhost/api/auth/signin/google", {
    headers: { cookie: `${TURNSTILE_VERIFIED_COOKIE}=${value}` },
  });
}

afterEach(() => {
  for (const name of envNames) {
    const value = previous[name];
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  process.env.NODE_ENV = previousNodeEnv;
});

describe("turnstile verification gate", () => {
  const now = 1_790_000_000_000;

  it("verifies a freshly issued value", () => {
    const value = createTurnstileVerifiedValue(now);
    expect(verifyTurnstileVerification(requestWithCookie(value), now)).toBe(
      true,
    );
  });

  it("rejects a tampered signature", () => {
    const value = createTurnstileVerifiedValue(now);
    const tampered = `${value.slice(0, -1)}${value.endsWith("a") ? "b" : "a"}`;
    expect(
      verifyTurnstileVerification(requestWithCookie(tampered), now),
    ).toBe(false);
  });

  it("rejects an expired value beyond the grace window", () => {
    const value = createTurnstileVerifiedValue(now);
    const later = now + 11 * 60 * 1000;
    expect(verifyTurnstileVerification(requestWithCookie(value), later)).toBe(
      false,
    );
  });

  it("rejects a value issued in the future", () => {
    const value = createTurnstileVerifiedValue(now + 60_000);
    expect(verifyTurnstileVerification(requestWithCookie(value), now)).toBe(
      false,
    );
  });

  it("rejects requests without the cookie", () => {
    expect(
      verifyTurnstileVerification(
        new Request("http://localhost/api/auth/signin/google"),
        now,
      ),
    ).toBe(false);
  });

  it("builds an HttpOnly, SameSite=Lax cookie with the right TTL", () => {
    const cookie = turnstileVerifiedCookie(true, now);
    expect(cookie).toContain(`${TURNSTILE_VERIFIED_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=600");
  });

  it("omits Secure when not on https", () => {
    expect(turnstileVerifiedCookie(false, now)).not.toContain("Secure");
  });

  it("throws in production when no secret is configured", () => {
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.AUTH_SECRET;
    process.env.NODE_ENV = "production";

    expect(() => createTurnstileVerifiedValue(now)).toThrow(
      /NEXTAUTH_SECRET.*required in production/,
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run --project unit src/lib/turnstile-gate.test.ts`
Expected: FAIL — module `@/lib/turnstile-gate` does not exist.

- [ ] **Step 3: Implement `src/lib/turnstile-gate.ts`**

```ts
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { getEnv } from "@/lib/config";

export const TURNSTILE_VERIFIED_COOKIE = "umkm_turnstile_verified";
export const TURNSTILE_GRACE_MS = 10 * 60 * 1000;

const VERSION = "v1";

function getSecret() {
  const configured = getEnv("NEXTAUTH_SECRET") || getEnv("AUTH_SECRET");
  if (configured) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "A turnstile gate secret (NEXTAUTH_SECRET) is required in production.",
    );
  }
  return "dev-turnstile-gate";
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function buildBody(issuedAtSeconds: string, nonce: string) {
  return [VERSION, issuedAtSeconds, nonce].join(".");
}

function issueValue(now: number) {
  const issuedAtSeconds = Math.floor(now / 1000).toString(36);
  const nonce = randomUUID();
  const body = buildBody(issuedAtSeconds, nonce);
  const signature = sign(`${TURNSTILE_VERIFIED_COOKIE}:${body}`, getSecret());
  return `${body}.${signature}`;
}

export function createTurnstileVerifiedValue(now = Date.now()): string {
  return issueValue(now);
}

export function verifyTurnstileVerification(
  request: Request,
  now = Date.now(),
): boolean {
  const cookies = request.headers.get("cookie")?.split(";") ?? [];
  const cookie = cookies
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${TURNSTILE_VERIFIED_COOKIE}=`));

  if (!cookie) {
    return false;
  }

  const value = cookie.slice(TURNSTILE_VERIFIED_COOKIE.length + 1);
  const [version, issuedAt, nonce, signature, ...extra] = value.split(".");

  if (
    version !== VERSION ||
    !issuedAt ||
    !nonce ||
    !signature ||
    extra.length > 0
  ) {
    return false;
  }

  const issuedAtMs = Number.parseInt(issuedAt, 36) * 1000;
  if (
    !Number.isFinite(issuedAtMs) ||
    issuedAtMs > now ||
    now - issuedAtMs > TURNSTILE_GRACE_MS
  ) {
    return false;
  }

  const body = buildBody(issuedAt, nonce);
  const expected = sign(`${TURNSTILE_VERIFIED_COOKIE}:${body}`, getSecret());
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);

  return left.length === right.length && timingSafeEqual(left, right);
}

export function turnstileVerifiedCookie(
  secure: boolean,
  now = Date.now(),
): string {
  const maxAge = Math.floor(TURNSTILE_GRACE_MS / 1000);
  return `${TURNSTILE_VERIFIED_COOKIE}=${issueValue(now)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run --project unit src/lib/turnstile-gate.test.ts`
Expected: PASS.

- [ ] **Step 5: Set the cookie on successful verification**

In `src/routes/api.auth.turnstile.ts`, replace the success return (`:21`):

```ts
        const secure = /^https:/.test(getEnv("NEXTAUTH_URL") || "");

        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": turnstileVerifiedCookie(secure),
          },
        });
```

Add the imports to the same file:

```ts
import { getEnv } from "@/lib/config";
import { turnstileVerifiedCookie } from "@/lib/turnstile-gate";
```

(Keep the existing `verifyTurnstileToken` import from `@/lib/turnstile`.)

- [ ] **Step 6: Gate signin initiation in the auth catch-all**

In `src/routes/api.auth.$.ts`, replace the whole file body with:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { handleAuthRequest } from "@/lib/auth";
import { verifyTurnstileVerification } from "@/lib/turnstile-gate";

// Matches signin initiation only: /api/auth/signin/<provider>. The OAuth
// callback (/api/auth/callback/*) is a redirect back from the provider and is
// NOT gated — the gate ran when the signin was initiated.
const SIGNIN_PATH = /^\/api\/auth\/signin\/[^/]+$/;

// Catch-all for every Auth.js Core endpoint: sign-in, OAuth callback,
// sign-out, csrf, session, providers. Replaces the previous
// /api/auth/[...nextauth] route.
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuthRequest(request),
      POST: ({ request }) => {
        const { pathname } = new URL(request.url);

        if (SIGNIN_PATH.test(pathname) && !verifyTurnstileVerification(request)) {
          return Response.json(
            { message: "Verifikasi belum berhasil. Coba lagi." },
            { status: 403 },
          );
        }

        return handleAuthRequest(request);
      },
    },
  },
});
```

- [ ] **Step 7: Update the turnstile route test**

In `tests/routes/auth.turnstile.test.ts`, extend the first test so it also asserts the cookie. After the existing `expect(response.status).toBe(200);` line, add:

```ts
    expect(response.headers.get("set-cookie")).toContain(
      "umkm_turnstile_verified=",
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
```

- [ ] **Step 8: Run all touched tests**

Run:
```bash
bunx vitest run --project unit src/lib/turnstile-gate.test.ts src/routes/api.auth.turnstile.ts tests/routes/auth.turnstile.test.ts
```
Expected: PASS. (Vitest picks the route test up by path; if the command reports the file filter missed, run `bunx vitest run --project unit tests/routes/auth.turnstile.test.ts src/lib/turnstile-gate.test.ts` instead.)

- [ ] **Step 9: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add src/lib/turnstile-gate.ts src/lib/turnstile-gate.test.ts src/routes/api.auth.turnstile.ts src/routes/api.auth.\$.ts tests/routes/auth.turnstile.test.ts
git commit -m "feat(security): enforce Turnstile server-side on signin"
```

---

### Task 5: Route error-leak sites through `mapToUserFacingError` (MEDIUM)

**Files:**
- Modify: `src/lib/user-facing-error.ts` (extend `KNOWN`)
- Modify: `src/lib/user-facing-error.test.ts`
- Modify: `src/routes/api.uploads.temp-images.ts:36-46`
- Modify: `src/routes/api.support.tickets.ts:75-83`
- Modify: `src/routes/api.support.tickets.$ticketId.ts:88-98`
- Modify: `src/routes/api.support.tickets.$ticketId.resolve.ts:25-35`
- Modify: `src/routes/api.admin.tickets.$ticketId.reply.ts:83-93`
- Modify: `src/routes/api.admin.tickets.$ticketId.resolve.ts:43-53`
- Modify: `src/routes/api.projects.$id.generate.ts:305-311`

**Interfaces:**
- Consumes: `mapToUserFacingError(reason: string): string` (existing).
- Produces: benign temp-image upload messages round-trip verbatim; everything else unknown → generic Indonesian.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/user-facing-error.test.ts`:

```ts
describe("temp-image and support error mappings", () => {
  it("round-trips benign temp-image upload messages", () => {
    expect(
      mapToUserFacingError("Ukuran gambar maksimal 5 MB per file."),
    ).toBe("Ukuran gambar maksimal 5 MB per file.");
    expect(
      mapToUserFacingError(
        "Format gambar tidak didukung. Gunakan PNG, JPEG, atau WEBP.",
      ),
    ).toBe("Format gambar tidak didukung. Gunakan PNG, JPEG, atau WEBP.");
    expect(
      mapToUserFacingError("Upload gambar sudah kedaluwarsa. Pilih gambar lagi."),
    ).toBe("Upload gambar sudah kedaluwarsa. Pilih gambar lagi.");
    expect(mapToUserFacingError("Gambar tidak valid.")).toBe(
      "Gambar tidak valid.",
    );
    expect(mapToUserFacingError("Pilih gambar dulu.")).toBe("Pilih gambar dulu.");
  });

  it("maps raw infra errors to generic fallback (never the raw string)", () => {
    expect(
      mapToUserFacingError(
        "connect ECONNREFUSED 10.0.0.5:9000 (minio internal host)",
      ),
    ).toBe("Permintaan belum bisa diproses. Coba lagi nanti.");
    expect(
      mapToUserFacingError("PrismaClientKnownRequestError: P2003 relation not found"),
    ).toBe("Permintaan belum bisa diproses. Coba lagi nanti.");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run --project unit src/lib/user-facing-error.test.ts`
Expected: FAIL — the round-trip cases return the generic fallback.

- [ ] **Step 3: Extend `KNOWN`**

In `src/lib/user-facing-error.ts`, append to the `KNOWN` array (after the existing `resend|email` entry):

```ts
  {
    match: /ukuran gambar maksimal 5 mb/i,
    message: "Ukuran gambar maksimal 5 MB per file.",
  },
  {
    match: /format gambar tidak didukung/i,
    message: "Format gambar tidak didukung. Gunakan PNG, JPEG, atau WEBP.",
  },
  {
    match: /upload gambar sudah kedaluwarsa/i,
    message: "Upload gambar sudah kedaluwarsa. Pilih gambar lagi.",
  },
  {
    match: /gambar tidak valid/i,
    message: "Gambar tidak valid.",
  },
  {
    match: /pilih gambar dulu/i,
    message: "Pilih gambar dulu.",
  },
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run --project unit src/lib/user-facing-error.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the mapper into the seven leak sites**

For each site, replace the raw-message echo with `mapToUserFacingError(...)` and log the raw error server-side. The exact edits:

**`src/routes/api.uploads.temp-images.ts`** — replace the catch block (`:36-46`) with:

```ts
        } catch (error) {
          const raw = error instanceof Error ? error.message : "";
          console.error("[upload] temp image failed:", raw);
          return Response.json({ message: mapToUserFacingError(raw) }, { status: 400 });
        }
```

Add the import at the top:

```ts
import { mapToUserFacingError } from "@/lib/user-facing-error";
```

**`src/routes/api.support.tickets.ts`** — replace the catch block (`:75-83`):

```ts
      } catch (error) {
        const raw = error instanceof Error ? error.message : "";
        console.error("[support] create ticket failed:", raw);
        return Response.json(
          { message: mapToUserFacingError(raw) },
          { status: 400 },
        );
      }
```

Add the same import if not present.

**`src/routes/api.support.tickets.$ticketId.ts`** — replace the catch block (`:88-98`):

```ts
      } catch (error) {
        const raw = error instanceof Error ? error.message : "";
        console.error("[support] ticket message failed:", raw);
        return Response.json(
          { message: mapToUserFacingError(raw) },
          { status: 400 },
        );
      }
```

**`src/routes/api.support.tickets.$ticketId.resolve.ts`** — replace the catch block (`:25-35`):

```ts
      } catch (error) {
        const raw = error instanceof Error ? error.message : "";
        console.error("[support] resolve ticket failed:", raw);
        return Response.json(
          { message: mapToUserFacingError(raw) },
          { status: 400 },
        );
      }
```

**`src/routes/api.admin.tickets.$ticketId.reply.ts`** — replace the catch block (`:83-93`):

```ts
      } catch (error) {
        const raw = error instanceof Error ? error.message : "";
        console.error("[admin][support] reply failed:", raw);
        return Response.json(
          { message: mapToUserFacingError(raw) },
          { status: 400 },
        );
      }
```

**`src/routes/api.admin.tickets.$ticketId.resolve.ts`** — replace the catch block (`:43-53`):

```ts
      } catch (error) {
        const raw = error instanceof Error ? error.message : "";
        console.error("[admin][support] resolve failed:", raw);
        return Response.json(
          { message: mapToUserFacingError(raw) },
          { status: 400 },
        );
      }
```

**`src/routes/api.projects.$id.generate.ts`** — replace the `publishBuildProgress` `detail` line (`:307-308`):

```ts
    publishBuildProgress(operationAttemptId, {
      type: "error",
      detail: mapToUserFacingError(
        error instanceof Error ? error.message : String(error),
      ),
      message: "Build belum bisa dimulai. Coba lagi sebentar.",
    });
```

Add the import at the top:

```ts
import { mapToUserFacingError } from "@/lib/user-facing-error";
```

Before editing each site, read the current file to confirm the exact catch-block shape (line numbers in this plan are from the audit; adjust the edit to the real surrounding code — the pattern to apply is identical).

- [ ] **Step 6: Verify no raw `error.message` remains in these routes**

Run:
```bash
grep -rn "error.message" src/routes/api.uploads.temp-images.ts src/routes/api.support.tickets.ts "src/routes/api.support.tickets.\$ticketId.ts" "src/routes/api.support.tickets.\$ticketId.resolve.ts" "src/routes/api.admin.tickets.\$ticketId.reply.ts" "src/routes/api.admin.tickets.\$ticketId.resolve.ts" "src/routes/api.projects.\$id.generate.ts"
```
Expected: no output (all raw echoes removed).

- [ ] **Step 7: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/lib/user-facing-error.ts src/lib/user-facing-error.test.ts src/routes/api.uploads.temp-images.ts src/routes/api.support.tickets.ts "src/routes/api.support.tickets.\$ticketId.ts" "src/routes/api.support.tickets.\$ticketId.resolve.ts" "src/routes/api.admin.tickets.\$ticketId.reply.ts" "src/routes/api.admin.tickets.\$ticketId.resolve.ts" "src/routes/api.projects.\$id.generate.ts"
git commit -m "fix(security): route error-leak sites through mapToUserFacingError"
```

---

### Task 6: Correct the preview CORS comment (MEDIUM)

**Files:**
- Modify: `src/lib/projects/runtime-proxy.ts:153-160`

**Interfaces:** N/A — comment-only change plus a repo-wide negative check.

- [ ] **Step 1: Replace the misleading comment**

In `src/lib/projects/runtime-proxy.ts`, replace the comment + function header (`:153-156`):

```ts
// Content-Security-Policy set here is overwritten later by applySecurityHeaders in the global securityMiddleware.
export function applyPreviewSandboxHeaders(
```

with:

```ts
// The preview iframe is sandboxed WITHOUT allow-same-origin (opaque origin),
// so any subresource fetch() the generated app makes is a cross-origin
// request that requires Access-Control-Allow-Origin. "*" is deliberate and
// safe here: the iframe sends no credentials (no Allow-Credentials is ever
// set), and opaque-origin requests carry no cookies. applySecurityHeaders
// does NOT manage CORS headers — do not assume this is overwritten later.
// The Content-Security-Policy set here IS overwritten by the global
// securityMiddleware's applySecurityHeaders.
export function applyPreviewSandboxHeaders(
```

- [ ] **Step 2: Confirm no credentialed CORS anywhere**

Run:
```bash
grep -rin "access-control-allow-credentials" src/
```
Expected: no output.

- [ ] **Step 3: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/projects/runtime-proxy.ts
git commit -m "fix(security): document CORS intent on preview proxy responses"
```

---

### Task 7: CI secret handling + action pinning (LOW)

**Files:**
- Modify: `.github/workflows/deploy.yml:106-133`
- Modify: `.github/workflows/quality.yml:59,62`

**Interfaces:** N/A — workflow config only.

- [ ] **Step 1: Move `DEPLOY_PATH` into the ssh-action `envs:`**

In `.github/workflows/deploy.yml`, change the `with:` block so `envs:` includes both vars:

```yaml
          envs: APP_IMAGE_TAG, DEPLOY_PATH
```

and change the script line:

```yaml
            cd "$DEPLOY_PATH"
```

and add to the existing `env:` block at the bottom of the step:

```yaml
        env:
          APP_IMAGE_TAG: ${{ needs.build-and-push.outputs.tag }}
          DEPLOY_PATH: ${{ secrets.DEPLOY_PATH }}
```

- [ ] **Step 2: SHA-pin `quality.yml` actions**

In `.github/workflows/quality.yml`, replace:

```yaml
        uses: actions/checkout@v5
```

with:

```yaml
        uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0
```

and replace:

```yaml
        uses: oven-sh/setup-bun@v2
```

with:

```yaml
        uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
```

- [ ] **Step 3: Validate the YAML**

Run:
```bash
bunx yaml-lint .github/workflows/deploy.yml .github/workflows/quality.yml 2>/dev/null || bun -e "import('js-yaml').then(({load}) => { ['deploy','quality'].forEach((n) => { const fs = require('node:fs'); load(fs.readFileSync('.github/workflows/' + n + '.yml', 'utf8')); console.log(n + ' ok'); }); })"
```
Expected: both files parse (`deploy ok`, `quality ok`). If neither tool is available, verify by eye that indentation is consistent with the surrounding YAML blocks.

- [ ] **Step 4: Run the fast gate (local files unaffected by workflow changes)**

Run: `bun run check`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml .github/workflows/quality.yml
git commit -m "chore(ci): pass DEPLOY_PATH via envs, SHA-pin quality actions"
```

---

## Post-implementation

- Run `bun run verify` (docs + route regen + full gate) before push, per repo rules.
- Deferred items are tracked in the spec's Out of Scope section: JWT session revocation, isolated build executor, publish-time content re-scan, `/p/*` frame-ancestors decision, dependency CVEs (`bun update`), and the Cloudflare Zero Trust dashboard check (operational, not code).
- If the Turnstile gate surfaces issues in the real login flow (e.g. OAuth callback replay across tabs), revisit the grace-window policy in `turnstile-gate.ts` — do not remove the gate.

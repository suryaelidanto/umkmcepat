# CSP Nonce & Sandbox Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the app from a blank screen caused by blocking inline TanStack hydration scripts, while improving security headers, sandboxing previews, and enabling CSP violation logging.

**Architecture:** Implement per-request nonces in an AsyncLocalStorage context, plumb nonces to the TanStack Router instance and layout, adjust CSP scopes for sandboxed/generated origins, and wire/secure the CSP violation endpoint.

**Tech Stack:** TanStack Start, Bun, React, Node.js (AsyncLocalStorage)

## Global Constraints
* User-facing copy: Indonesian. Developer-facing/logs/errors: English.
* Only touch files required by the task.
* Run formatting (`bun run check:commit` / `bun run check`) to verify clean gates.

---

### Task 1: Nonce Store & Middleware

Create an AsyncLocalStorage store to keep a per-request random CSP nonce and hook it into the global request lifecycle.

**Files:**
- Create: `src/lib/csp-nonce.ts`
- Modify: `src/start.ts`

**Interfaces:**
- Produces: 
  - `src/lib/csp-nonce.ts` -> `getNonceStore(): AsyncLocalStorage<string>`
  - `src/lib/csp-nonce.ts` -> `getNonce(): string | undefined`
  - `src/lib/csp-nonce.ts` -> `generateNonce(): string`

- [ ] **Step 1: Create Nonce Store**

Write `src/lib/csp-nonce.ts`:
```typescript
import { AsyncLocalStorage } from "node:async_hooks";

const nonceStore = new AsyncLocalStorage<string>();

export function getNonceStore() {
  return nonceStore;
}

export function getNonce() {
  return nonceStore.getStore();
}

export function generateNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, "");
}
```

- [ ] **Step 2: Modify Middleware to Run inside AsyncLocalStorage & Set Headers**

Read and Edit `src/start.ts`:
* Wrap the `next()` invocation in the `nonceStore.run()` callback.
* Generate a nonce for the current request.
* Pass the generated nonce down to `applySecurityHeaders`.

Edit `src/start.ts` imports and middleware logic:
```typescript
import { getNonceStore, generateNonce } from "@/lib/csp-nonce";
// ... in securityMiddleware ...
const nonce = generateNonce();

const result = await getNonceStore().run(nonce, async () => {
  return await next();
});

applySecurityHeaders(result.response.headers, { 
  generatedOrigin, 
  pathname, 
  nonce 
});
return result;
```
Also update error/rate-limit response calls to `applySecurityHeaders` in `src/start.ts` to pass the `nonce`.

- [ ] **Step 3: Update `applySecurityHeaders` Signature and CSP Generation**

Read and Edit `src/lib/security-headers.ts`:
* Update signature to accept `nonce?: string`.
* Set CSP for control plane (non-generated, non-preview): `"frame-ancestors 'none'; object-src 'none'; base-uri 'self'; script-src 'nonce-" + nonce + "' 'strict-dynamic' https: 'unsafe-inline'; report-uri /api/csp-violation"`
* Set CSP-Report-Only for preview: `"sandbox allow-scripts; frame-ancestors 'self'; object-src 'none'; base-uri 'none'; script-src 'nonce-" + nonce + "' 'strict-dynamic' https: 'unsafe-inline'; report-uri /api/csp-violation"`
* Set CSP-Report-Only for generated origin: `"object-src 'none'; base-uri 'none'; script-src 'nonce-" + nonce + "' 'strict-dynamic' https: 'unsafe-inline'; report-uri /api/csp-violation"`
* Ensure `applyPreviewSandboxHeaders` has a comment indicating its CSP sandbox header is overridden by `start.ts`.
* In `applySecurityHeaders` control plane branch, set `headers.set("Cache-Control", "no-store, no-cache, must-revalidate");` when rendering HTML.

- [ ] **Step 4: Run unit tests to verify compile/check**

Run: `bun run check`
Expected: Passes formatting, types, and existing tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/csp-nonce.ts src/start.ts src/lib/security-headers.ts
git commit -m "feat(security): implement per-request CSP nonce storage and middleware integration" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Plumbing Nonce to TanStack Router & Hydration

Pass the request-scoped nonce into the TanStack router SSR config and render properties so HTML scripts include the nonce.

**Files:**
- Modify: `src/router.tsx`
- Modify: `src/routes/__root.tsx`

**Interfaces:**
- Consumes:
  - `src/lib/csp-nonce.ts` -> `getNonce(): string | undefined`

- [ ] **Step 1: Modify `src/router.tsx` to read dynamic nonce**

Read and Edit `src/router.tsx`:
* Read dynamic nonce using `getNonce()` inside `getRouter()` if on server.
* Inject `ssr: { nonce }` into the router instantiation.

```typescript
import { getNonce } from "@/lib/csp-nonce";
// ... inside getRouter() ...
const ssrNonce = typeof window === "undefined" ? getNonce() : undefined;
const router = createRouter({
  routeTree,
  scrollRestoration: true,
  defaultPreload: "intent",
  defaultPendingMs: 200,
  defaultPendingMinMs: 0,
  ssr: ssrNonce ? { nonce: ssrNonce } : undefined,
});
```

- [ ] **Step 2: Add Nonce to JSX Script tags in `__root.tsx`**

Read and Edit `src/routes/__root.tsx`:
* Import `getNonce` and `useRouter`.
* Extract `router.options.ssr?.nonce` (or call `getNonce()`) and pass to JSON-LD `<script>` and Umami `<script>`.

```typescript
// ... inside RootComponent ...
const router = useRouter();
const nonce = router.options.ssr?.nonce;

// ... in JSX ...
<script
  nonce={nonce}
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
/>

{process.env.NEXT_PUBLIC_UMAMI_SCRIPT_SRC && (
  <script
    nonce={nonce}
    defer
    src={process.env.NEXT_PUBLIC_UMAMI_SCRIPT_SRC}
    data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
  />
)}
```

- [ ] **Step 3: Run check**

Run: `bun run check`
Expected: Compile/formatting passes.

- [ ] **Step 4: Commit**

```bash
git add src/router.tsx src/routes/__root.tsx
git commit -m "fix(security): plumb CSP nonce into TanStack router SSR options and JSX scripts" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Secure the Violation Sink

Ensure the CSP violation endpoint is reachable by bypasses and protected from size abuses.

**Files:**
- Modify: `src/routes/api.csp-violation.ts`
- Modify: `src/lib/security-headers.ts`

- [ ] **Step 1: Exempt CSP violations from CSRF checks**

Read and Edit `src/lib/security-headers.ts`:
* Exclude `/api/csp-violation` route in `isCrossSiteMutation`.

```typescript
// ... in isCrossSiteMutation ...
if (
  pathname.startsWith("/api/auth/") ||
  pathname === "/api/payment/webhook" ||
  pathname === "/api/csp-violation"
) {
  return false;
}
```

- [ ] **Step 2: Limit request size in `/api/csp-violation`**

Read and Edit `src/routes/api.csp-violation.ts`:
* Check Content-Length header or parse size check. Keep body parsing safe.

```typescript
const contentLength = Number(request.headers.get("content-length") || "0");
if (contentLength > 1024 * 50) { // 50KB limit
  return Response.json({ error: "Payload too large" }, { status: 413 });
}
```

- [ ] **Step 3: Run check**

Run: `bun run check`
Expected: All validation passes.

- [ ] **Step 4: Commit**

```bash
git add src/routes/api.csp-violation.ts src/lib/security-headers.ts
git commit -m "fix(security): exempt CSP violation route from CSRF and enforce payload limits" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: E2E Verification

Verify fixes behaviorally to ensure no CSP errors occur in the console on all routes.

- [ ] **Step 1: Boot dev infrastructure & server**

Run: `bun run infra:minimal` (starts postgres if not running)
Run: `bun run dev`

- [ ] **Step 2: Inspect browser console**

Open `http://localhost:3000` in your browser.
Expected:
* Page loads, layout is rendered, hydration spinner disappears.
* DevTools console has 0 Content Security Policy script-src violations.
* Network tab shows security headers loaded with `script-src 'nonce-...`.

- [ ] **Step 3: Inspect Project Preview**

Navigate to the project editor and open a preview.
Expected:
* Preview renders.
* Console has 0 opaque-origin scripts blocked errors.
* Click-to-annotate hover works.

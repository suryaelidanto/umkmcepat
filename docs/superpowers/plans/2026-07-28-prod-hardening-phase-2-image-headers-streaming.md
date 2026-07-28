# Production Hardening Phase 2: Image, Headers, and Streaming `/edit` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink and harden the production image, add the missing HSTS and CSP directives, and convert `/api/projects/$id/edit` from a blocking 10-minute request into a stream — the prerequisite for Cloudflare ingress in Phase 3.

**Architecture:** Independent infrastructure and header changes land first because they are cheap to verify and revert. The `/edit` conversion lands last and alone, because it is the only change here that touches user-visible product behavior and requires server and client to move in lockstep.

**Tech Stack:** Docker multi-stage builds, Bun 1.3.9, TanStack Start global middleware (`src/start.ts`), Server-Sent Events, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-28-production-security-hardening-design.md` (§5 Phase 2)

**Depends on:** Phase 1 complete and CI green.

## Global Constraints

- Package manager is **Bun only**; `bun.lock` is canonical.
- Work from `dev`.
- HSTS value is exactly `max-age=63072000; includeSubDomains` for the initial rollout. **Do not add `preload`** until the domain has been stable on HTTPS in production — preload is effectively irreversible.
- HSTS must be set on the control plane **only**, never on the generated-project origin (we do not control its subdomains).
- CSP origins are drawn from verified code references only. The confirmed set is: `https://api.dicebear.com` (`src/lib/profile.ts:9`), `https://api.qrserver.com` (`src/components/payment/EnergyBoosterModal.tsx:159`), `https://challenges.cloudflare.com` (Turnstile widget), plus the runtime values of `S3_PUBLIC_BASE_URL` and `NEXT_PUBLIC_UMAMI_SCRIPT_SRC`.
- `style-src 'unsafe-inline'` is a deliberate, documented concession to Tailwind. Do not attempt to remove it in this phase.
- SSE wire format is `event: <name>\ndata: <json>\n\n` (`api.projects.$id.generate.ts:73-75`). Do not invent a different framing.
- User-facing copy is **Indonesian**; code, comments, and logs are **English**.
- Do not run `bun run build` except where a step explicitly calls for it.

---

### Task 1: Stop shipping 3.8 GB of local data into the build context

`.dockerignore` omits `.data/` (measured 3.8 GB), so `COPY . .` (`Dockerfile:15`) copies local uploads and generated projects into the image.

**Files:**
- Modify: `.dockerignore`

- [ ] **Step 1: Measure the current build context**

Run: `du -sh .data graphify-out .pi-subagents .superpowers storybook-static .claude 2>/dev/null`
Expected: `.data` dominates at multiple GB. Record the total — Step 4 compares against it.

- [ ] **Step 2: Extend `.dockerignore`**

Append to `.dockerignore`:

```
# Local runtime data, agent artifacts, and build outputs. None of this belongs
# in a production image; .data alone is multiple GB of local uploads and
# generated projects.
.data
.output
.nitro
.tanstack
graphify-out
storybook-static
.pi-subagents
.superpowers
.claude
.agents
__captures__
.omc
dev.log*
```

`.output` and `.nitro` are excluded deliberately: the builder stage regenerates them, and copying a stale host build into the context risks shipping it.

- [ ] **Step 3: Verify the ignore rules actually match**

Run:

```bash
docker build --no-cache -t umkmcepat-context-check . 2>&1 | head -3
```

Expected: the first line reports the transferred context size. It should be **under 50 MB**.

If it is still large, a rule is not matching — `.dockerignore` patterns are relative to the context root and do not accept a leading `/`. Check for a stray slash before re-running.

- [ ] **Step 4: Confirm the build still succeeds**

Expected: the build from Step 3 completes. If it fails because a needed path was excluded, remove only that specific rule and note why in a comment.

- [ ] **Step 5: Commit**

```bash
git add .dockerignore
git commit -m "fix(docker): exclude .data and agent artifacts from the build context

.data measured 3.8 GB and was being copied into the image by COPY . .,
along with graphify-out, storybook-static, and agent scratch directories."
```

---

### Task 2: Stop shipping devDependencies to production

`Dockerfile:9` installs all dependencies and the runner copies `node_modules` wholesale (`Dockerfile:34`). Storybook, Vitest, ESLint, and Playwright ship to production, including `@vitest/browser` and its critical advisory.

**Files:**
- Modify: `Dockerfile`

**Interfaces:**
- Produces: a runner stage whose `node_modules` contains production dependencies plus the generated Prisma Client. The `CMD` (`bun .output/server/index.mjs`) is unchanged.

- [ ] **Step 1: Add a production-only dependency stage**

In `Dockerfile`, after the existing `deps` stage (line 9), add:

```dockerfile
FROM docker.io/oven/bun:1.3.9-alpine AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts --production
```

- [ ] **Step 2: Point the runner at the pruned modules**

In the runner stage, replace:

```dockerfile
COPY --from=builder /app/node_modules ./node_modules
```

with:

```dockerfile
# Production dependencies only — the builder's node_modules carries Storybook,
# Vitest, ESLint, and Playwright, none of which belong in a runtime image.
COPY --from=prod-deps /app/node_modules ./node_modules
# Prisma Client is code-generated during the build, so it does not exist in a
# fresh production install and must be carried over explicitly.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
```

- [ ] **Step 3: Build**

Run: `docker build -t umkmcepat-app:prune-test .`
Expected: SUCCESS. A green build here proves nothing about Prisma — Step 4 is the real test.

- [ ] **Step 4: Verify Prisma actually resolves at runtime**

This is the sharp edge of the change. A missing Prisma Client fails at first query, not at build.

```bash
docker run --rm --entrypoint bun umkmcepat-app:prune-test \
  -e "const {PrismaClient} = await import('@prisma/client'); new PrismaClient(); console.log('prisma ok')"
```

Expected: prints `prisma ok`. If it throws about a missing engine or generated client, the `.prisma` copy path is wrong — inspect with `docker run --rm --entrypoint ls umkmcepat-app:prune-test node_modules/.prisma`.

- [ ] **Step 5: Confirm devDependencies are gone**

```bash
docker run --rm --entrypoint ls umkmcepat-app:prune-test node_modules | grep -cE "^(vitest|@storybook|eslint|playwright)$"
```

Expected: `0`.

- [ ] **Step 6: Compare image size**

Run: `docker images umkmcepat-app --format "{{.Tag}} {{.Size}}"`
Expected: the pruned image is materially smaller. Record both numbers for the commit body.

- [ ] **Step 7: Commit**

```bash
git add Dockerfile
git commit -m "fix(docker): prune devDependencies from the production image

Adds a prod-deps stage and carries the generated Prisma Client across
explicitly, since it does not exist in a fresh production install."
```

---

### Task 3: Add HSTS to control-plane responses

`applySecurityHeaders()` sets five security headers but never `Strict-Transport-Security` (spec F6).

**Files:**
- Modify: `src/lib/security-headers.ts:51-53`
- Modify: `src/lib/security-headers.test.ts`

- [ ] **Step 1: Read the existing test file to match its conventions**

Run: `head -40 src/lib/security-headers.test.ts`
Expected: you see how existing cases construct `new Headers()` and call `applySecurityHeaders` with `{ generatedOrigin, pathname, nonce }`. Match that style exactly.

- [ ] **Step 2: Write the failing tests**

Add to `src/lib/security-headers.test.ts`:

```ts
  it("sets HSTS on control-plane responses", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, {
      generatedOrigin: false,
      pathname: "/dashboard",
      nonce: "test-nonce",
    });

    expect(headers.get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains",
    );
  });

  it("does not set HSTS on the generated-project origin", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, {
      generatedOrigin: true,
      pathname: "/",
      nonce: "test-nonce",
    });

    // We do not control generated subdomains and must not pin them.
    expect(headers.get("Strict-Transport-Security")).toBeNull();
  });
```

- [ ] **Step 3: Run and verify they fail**

Run: `bunx vitest run --project unit src/lib/security-headers.test.ts`
Expected: FAIL — the first case gets `null`.

- [ ] **Step 4: Implement**

In `src/lib/security-headers.ts`, the generated-origin branch returns early at line 71, so setting HSTS *after* that branch gives the required split automatically. Insert immediately before `const privatePreview = ...` (line 73):

```ts
  // Control plane only. The generated-project origin returned above: we do not
  // control its subdomains and must not pin them. `preload` is deliberately
  // omitted until the domain is confirmed stable on HTTPS — it is effectively
  // irreversible once submitted.
  headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains",
  );
```

- [ ] **Step 5: Run and verify they pass**

Run: `bunx vitest run --project unit src/lib/security-headers.test.ts`
Expected: PASS, including all pre-existing cases.

- [ ] **Step 6: Commit**

```bash
git add src/lib/security-headers.ts src/lib/security-headers.test.ts
git commit -m "feat(security): add HSTS to control-plane responses"
```

---

### Task 4: Add the missing CSP directives in report-only mode

The control-plane CSP (`security-headers.ts:89-94`) has no `default-src`, leaving `style-src`, `img-src`, `connect-src`, `font-src`, and `frame-src` unrestricted (spec F7). Because two origins are environment-dependent, the policy must be built at runtime rather than hardcoded.

Ship **report-only** first. Enforcing an untested CSP breaks avatars, Turnstile, analytics, and payment QR codes in production.

**Files:**
- Modify: `src/lib/security-headers.ts`
- Modify: `src/lib/security-headers.test.ts`

**Interfaces:**
- Produces: `buildContentSecurityPolicy(nonce: string): string` — exported from `src/lib/security-headers.ts`, consumed by Task 6 when switching to enforcement.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/security-headers.test.ts`:

```ts
  it("builds a CSP covering every fetch directive", () => {
    vi.stubEnv("S3_PUBLIC_BASE_URL", "https://media.example.test");
    vi.stubEnv(
      "NEXT_PUBLIC_UMAMI_SCRIPT_SRC",
      "https://umami.example.test/script.js",
    );

    const policy = buildContentSecurityPolicy("test-nonce");

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("https://api.dicebear.com");
    expect(policy).toContain("https://api.qrserver.com");
    expect(policy).toContain("https://media.example.test");
    expect(policy).toContain("https://challenges.cloudflare.com");
    expect(policy).toContain("https://umami.example.test");
    expect(policy).toContain("'nonce-test-nonce'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");

    vi.unstubAllEnvs();
  });

  it("omits environment origins that are not configured", () => {
    vi.stubEnv("S3_PUBLIC_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_UMAMI_SCRIPT_SRC", "");

    const policy = buildContentSecurityPolicy("test-nonce");

    expect(policy).toContain("default-src 'self'");
    expect(policy).not.toContain("undefined");
    expect(policy).not.toContain("  ");

    vi.unstubAllEnvs();
  });
```

Add `buildContentSecurityPolicy` to the existing import from `@/lib/security-headers`, and `vi` to the existing `vitest` import if absent.

- [ ] **Step 2: Run and verify it fails**

Run: `bunx vitest run --project unit src/lib/security-headers.test.ts`
Expected: FAIL — `buildContentSecurityPolicy is not a function`.

- [ ] **Step 3: Implement the builder**

In `src/lib/security-headers.ts`, above `applySecurityHeaders`:

```ts
/**
 * Origins are taken from verified code references, not guesses:
 *   api.dicebear.com   — avatars, src/lib/profile.ts:9
 *   api.qrserver.com   — payment QR, EnergyBoosterModal.tsx:159
 *   challenges.cloudflare.com — Turnstile widget
 * S3_PUBLIC_BASE_URL and the Umami host are environment-dependent, so the
 * policy is assembled at runtime rather than declared as a constant.
 */
export function buildContentSecurityPolicy(nonce: string) {
  const mediaOrigin = originOf(process.env.S3_PUBLIC_BASE_URL);
  const umamiOrigin = originOf(process.env.NEXT_PUBLIC_UMAMI_SCRIPT_SRC);

  const img = [
    "'self'",
    "data:",
    "blob:",
    "https://api.dicebear.com",
    "https://api.qrserver.com",
    mediaOrigin,
  ].filter(Boolean);

  const script = [
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "https:",
    "'unsafe-inline'",
    umamiOrigin,
  ].filter(Boolean);

  const connect = ["'self'", umamiOrigin].filter(Boolean);

  return [
    "default-src 'self'",
    `img-src ${img.join(" ")}`,
    `script-src ${script.join(" ")}`,
    `connect-src ${connect.join(" ")}`,
    // Tailwind injects inline styles; a nonce cannot cover them.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "frame-src https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "report-uri /api/csp-violation",
  ].join("; ");
}

function originOf(value: string | undefined) {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}
```

- [ ] **Step 4: Wire it in as report-only**

In `applySecurityHeaders`, inside the `else` branch (the control-plane path at line 88), **keep** the existing enforced `Content-Security-Policy` untouched and add alongside it:

```ts
    // Report-only during rollout. Task 6 promotes this to enforcement once
    // /api/csp-violation confirms a clean run across a full user journey.
    headers.set(
      "Content-Security-Policy-Report-Only",
      buildContentSecurityPolicy(nonceStr),
    );
```

- [ ] **Step 5: Run and verify tests pass**

Run: `bunx vitest run --project unit src/lib/security-headers.test.ts`
Expected: PASS.

- [ ] **Step 6: Exercise a real user journey and watch for violations**

```bash
bun run dev
```

With the browser console open, walk through: sign in, load the dashboard, open a project workspace, open the energy top-up modal (renders the QR image), and load a page with avatars.

Expected: **zero** CSP violation reports in the console. Any violation names an origin missing from the policy — add it to the correct directive with a source-reference comment, and note it in the commit body.

- [ ] **Step 7: Commit**

```bash
git add src/lib/security-headers.ts src/lib/security-headers.test.ts
git commit -m "feat(security): add full CSP directive set in report-only mode

default-src was absent, leaving style-src, img-src, connect-src, font-src,
and frame-src unrestricted. Report-only until a clean journey is confirmed."
```

---

### Task 5: Convert `/edit` to Server-Sent Events

`src/routes/api.projects.$id.edit.ts` (998 lines) returns `Response.json()` after up to `AI_TIMEOUT_EDIT_MS` (600 s). Cloudflare terminates non-streaming requests at ~100 s, so Phase 3 depends on this. It is also independently correct: users currently get no feedback for ten minutes.

Server and client must change together — this is one task, not two.

**Files:**
- Modify: `src/routes/api.projects.$id.edit.ts`
- Modify: `src/components/projects/WorkspaceShell.tsx:1816-1844`

**Interfaces:**
- Consumes: the SSE framing helper pattern from `api.projects.$id.generate.ts:73-75`.
- Produces: the `/edit` response is now `text/event-stream`. Event contract:
  - `event: progress`, `data: { label: string, detail?: string }` — zero or more
  - `event: done`, `data: { buildStatus: "succeeded", ... }` — terminal on success
  - `event: error`, `data: { message: string }` — terminal on failure
  - Pre-stream validation failures still return JSON with a non-2xx status, so HTTP status codes stay meaningful for them.

- [ ] **Step 1: Identify the stream boundary**

Run: `grep -nE "return Response.json|await (editGeneratedSourceWithAgent|renewProjectOperation|createLocalBuildWorker)" src/routes/api.projects.\$id.edit.ts | head -20`

Expected: early `Response.json` returns at lines ~317-383 (validation, auth, rate limit) and long-running work starting at line ~456. **Everything before the first long-running await stays synchronous JSON. Everything after moves inside the stream.**

- [ ] **Step 2: Add the SSE framing helper**

At module scope in `src/routes/api.projects.$id.edit.ts`, mirroring `generate.ts:73-75`:

```ts
function encodeEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
```

- [ ] **Step 3: Wrap the long-running section in a stream**

Replace the code from the first long-running await through the final `Response.json({...})` success return with:

```ts
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      const safeClose = () => {
        if (!isClosed) {
          isClosed = true;
          try {
            controller.close();
          } catch {
            // stream already torn down
          }
        }
      };

      const send = (event: string, data: unknown) => {
        if (!isClosed) {
          controller.enqueue(encoder.encode(encodeEvent(event, data)));
        }
      };

      try {
        // ─── existing long-running body goes here, unchanged except that ───
        // every `return Response.json({ ...ok })`  becomes  send("done", {...})
        // every `return Response.json({ ...err })` becomes  send("error", {...})
        // and each is followed by `return;` inside this start() function.
      } catch (error) {
        send("error", {
          message:
            error instanceof Error
              ? error.message
              : "Revisi gagal. Coba lagi sebentar.",
        });
      } finally {
        safeClose();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
```

- [ ] **Step 4: Emit progress at each existing await boundary**

Insert a `send("progress", ...)` before each long-running call already present in the handler. Indonesian copy, because these strings reach users:

```ts
send("progress", { label: "Menerapkan revisi" });      // before editGeneratedSourceWithAgent
send("progress", { label: "Memperbaiki hasil" });      // before the repair pass
send("progress", { label: "Menyimpan perubahan" });    // before projectSnapshot.create
send("progress", { label: "Membangun ulang" });        // before runBuild
send("progress", { label: "Menyelesaikan" });          // before the deployment transaction
```

- [ ] **Step 5: Update the client to read the stream**

In `src/components/projects/WorkspaceShell.tsx`, replace lines 1827-1830:

```ts
      const result = (await response.json().catch(() => null)) as {
        buildStatus?: string;
        message?: string;
      } | null;
```

with a reader loop matching the one already used for `/generate` at lines 850-871:

```ts
      let result: { buildStatus?: string; message?: string } | null = null;

      if (response.ok && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const rawEvent of events) {
            const eventName = rawEvent.match(/^event: (.+)$/m)?.[1];
            const dataText = rawEvent.match(/^data: (.+)$/m)?.[1];
            if (!eventName || !dataText) {
              continue;
            }

            const data = JSON.parse(dataText) as {
              buildStatus?: string;
              detail?: string;
              label?: string;
              message?: string;
            };

            if (eventName === "progress" && data.label) {
              setBuildProgress((current) =>
                appendBuildProgressStep(current, {
                  detail: data.detail,
                  label: data.label as string,
                  status: "active",
                }),
              );
            } else if (eventName === "done" || eventName === "error") {
              result = data;
            }
          }
        }
      }
```

The existing success/failure branch at lines 1832-1844 needs no change — it still reads `result?.buildStatus !== "succeeded"`.

- [ ] **Step 6: Typecheck and lint**

Run: `bun run typecheck && bunx eslint src/routes/api.projects.\$id.edit.ts src/components/projects/WorkspaceShell.tsx`
Expected: PASS.

- [ ] **Step 7: Exercise the real flow**

```bash
bun run dev
```

Open a project with generated source, enter annotation mode, leave a visual comment, and submit.

Expected: progress steps appear **incrementally** rather than after a long silence, and the preview refreshes on completion. A single jump straight to the final state means the stream is being buffered — check that no proxy or middleware is collecting the body.

- [ ] **Step 8: Confirm error handling still works**

Trigger a failure (submit an edit against a project with no successful build). Expected: the error branch renders "Revisi visual belum berhasil dibuild" and does not hang.

- [ ] **Step 9: Commit**

```bash
git add src/routes/api.projects.\$id.edit.ts src/components/projects/WorkspaceShell.tsx
git commit -m "feat(edit): stream /edit progress over SSE

Replaces a blocking response of up to AI_TIMEOUT_EDIT_MS (600s) with the
SSE pattern already used by /generate. Required for Cloudflare ingress,
which terminates non-streaming requests at ~100s, and gives users live
progress instead of a silent ten-minute wait."
```

---

### Task 6: Promote CSP from report-only to enforced

Only after Task 4 has run through a full journey with no violations.

**Files:**
- Modify: `src/lib/security-headers.ts`
- Modify: `src/lib/security-headers.test.ts`

- [ ] **Step 1: Confirm a clean report-only run**

Check the `/api/csp-violation` endpoint logs, or the browser console across the journey from Task 4 Step 6 plus the `/edit` flow from Task 5 Step 7.

Expected: no violations. **If any remain, stop** — fix the policy and repeat. Do not enforce a policy with known violations.

- [ ] **Step 2: Write the failing test**

```ts
  it("enforces the full CSP on control-plane responses", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, {
      generatedOrigin: false,
      pathname: "/dashboard",
      nonce: "test-nonce",
    });

    const policy = headers.get("Content-Security-Policy");
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(headers.get("Content-Security-Policy-Report-Only")).toBeNull();
  });
```

- [ ] **Step 3: Run and verify it fails**

Run: `bunx vitest run --project unit src/lib/security-headers.test.ts`
Expected: FAIL — the enforced header has no `default-src`.

- [ ] **Step 4: Promote**

In the control-plane `else` branch, replace the hardcoded policy string and the report-only header with a single enforced header:

```ts
    headers.set("Content-Security-Policy", buildContentSecurityPolicy(nonceStr));
```

Delete the `Content-Security-Policy-Report-Only` line added in Task 4 Step 4. Leave the private-preview and generated-origin branches untouched — they have their own deliberate policies.

- [ ] **Step 5: Run and verify**

Run: `bunx vitest run --project unit src/lib/security-headers.test.ts`
Expected: PASS.

- [ ] **Step 6: Re-walk the journey with enforcement live**

Run `bun run dev` and repeat the Task 4 Step 6 journey. Expected: no console errors, avatars/QR/Turnstile/analytics all render.

- [ ] **Step 7: Commit**

```bash
git add src/lib/security-headers.ts src/lib/security-headers.test.ts
git commit -m "feat(security): enforce the full CSP after a clean report-only run"
```

---

### Task 7: Phase gate

- [ ] **Step 1: Full gate**

Run: `bun run verify && bun run test:integration`
Expected: PASS.

- [ ] **Step 2: Storybook accessibility and visual tests**

Run: `bun run storybook:build && bun run test:storybook`
Expected: PASS. The tightened CSP is the likely culprit for any new failure here.

- [ ] **Step 3: Build the production image one more time**

Run: `docker build -t umkmcepat-app:phase2 .`
Expected: SUCCESS, context under 50 MB.

- [ ] **Step 4: Update documentation**

- `docs/architecture.md` — record that `/api/projects/$id/edit` is now a streaming endpoint, with its event contract.
- `docs/deployment.md` — note the pruned production image and that Prisma Client is carried across explicitly.

- [ ] **Step 5: Commit and push**

```bash
git add docs/architecture.md docs/deployment.md CHANGELOG.md
git commit -m "docs: phase 2 image, headers, and streaming edit"
git push origin dev
```

- [ ] **Step 6: Confirm CI is green before starting Phase 3**

Run: `gh run watch`
Expected: the `Quality` workflow passes.

# Analytics Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `scripts/provision-analytics.ts` — an idempotent, HTTP-only ops script that creates the Umami admin + website, reads the Website ID, and writes `NEXT_PUBLIC_UMAMI_*` into `.env`, so analytics work out of the box on first deploy.

**Architecture:** One TS file, raw `fetch` (Bun global), `node:fs`/`node:path`, no new deps. Talks to Umami's REST API only — no Prisma, no Docker, no shared app libs. Writes `.env` atomically (tmp + rename). Idempotent: skips existing admin (login succeeds → never setups) and existing website (GET finds it → never duplicates).

**Tech Stack:** Bun, `tsx` (already a dev dep via other scripts), TypeScript, Umami 3.2.0 REST API.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-27-analytics-provisioning-design.md` (read it first; this plan does not repeat its non-goals).
- **Bun-only** (CLAUDE.md); `bun.lock` is canonical — do not add lockfiles for other managers.
- **Env vars declared 1:1** in `.env` + `.env.example` as part of this feature (memory rule: `umkmcepat-env-vars-must-be-declared`).
- **Atomic commits:** one logical unit per commit to `dev`; stage only your own changes; pre-commit auto-fixes staged (memory rule: `umkmcepat-atomic-commits`).
- **Surgical edits:** touch only what the task requires; match surrounding style; don't refactor adjacent code (CLAUDE.md).
- **No unit tests** for this script — spec non-goal; idempotent re-run IS the test. Verification is the manual end-to-end checklist in Task 3.
- **`init-s3-buckets.ts` does not exist** in the tree (CLAUDE.md mentions it but it was never landed). The convention reference for ops scripts is `scripts/simulate-payment.ts`: `/* eslint-disable no-console */` header, `process.env` reads, raw `fetch` with `Content-Type: application/json`, `main().catch(...)` exit pattern.
- **Task 0 report governs over spec text where they conflict.** The spec's data-flow (cookie capture, setup fallback, `umkmcepat` default) was based on unverified assumptions. Task 0 verified: Bearer token (not cookie), no setup endpoint (admin seeded by init SQL), dev admin password `umami`. Task 2's code block below reflects these corrections; the spec's prose is stale on those three points until a follow-up docs sync updates it (folded into Task 3).
- **Umami 3.2.0 schema verified:** `website.name` (varchar 100), `website.domain` (varchar 500, nullable), `user.username` (unique). Script's POST body `{name, domain}` aligns. `website_id` is the uuid PK; the REST API returns it as `id`.
- **Umami 3.2.0 REST API verified (Task 0 report at `.superpowers/sdd/task-0-report.md`):**
  - Login `POST /api/auth/login {username, password}` → `200 {token, user}`. **Bearer token auth, NOT cookie.** No `Set-Cookie`. Subsequent calls send `Authorization: Bearer <token>`.
  - **No `/api/auth/setup` endpoint** (404). Umami 3.2.0 has no anonymous first-user bootstrap; admin is seeded by the postgres init SQL at first boot. The provisioner must NOT attempt setup. "Already provisioned" = login succeeds. If login 401s, that's a real wrong-password failure (not "admin missing") — exit non-zero with a clear message, don't fall back to setup.
  - List `GET /api/websites` with Bearer → `200 {data:[...], count, page, pageSize}`. Unwrap `.data`. ID field = `id`.
  - Create `POST /api/websites {name, domain}` with Bearer → `200 {id, name, domain, ...}`. ID field = `id`. (Server fills `userId`/`createdBy` from token.)
  - **Dev admin password is `umami`** (the admin seeded in the earlier session). Spec's `umkmcepat` default was wrong. Dev default in code + `.env` comment = `umami`.
- **Coordination:** sibling `wZ:pR` (admin-dashboard) owns disjoint files. Re-scan siblings before editing `.env`/`package.json` (shared-ish) — `herdr pane list` + read titles; coord note at `.superpowers/sdd/coord-analytics-prov.md`.

---

### Task 0: Verify Umami 3.2.0 REST endpoints (de-risk before coding)

The spec assumes `POST /api/auth/login`, `POST /api/auth/setup`, `GET /api/websites`, `POST /api/websites`. Earlier blind probes returned SPA HTML (404 on guessed paths) because the routes weren't confirmed. This task confirms the exact paths + response shapes so Task 2 codes against reality, not assumptions. Produces no code changes — just findings recorded in the plan.

**Files:**
- Read-only: live Umami container at `http://localhost:3001` (already running from earlier session; if down, `docker compose -f docker-compose.prod.yml up -d umami`).

**Interfaces:**
- Consumes: a running Umami 3.2.0 container.
- Produces: verified endpoint list + request/response shapes, pasted into Task 2's code blocks.

- [ ] **Step 1: Ensure Umami is up**

Run: `curl -s -o /dev/null -w '%{http_code}' http://localhost:3001`
Expected: `200`. If `000`, run `docker compose -f docker-compose.prod.yml up -d umami` and re-curl until 200.

- [ ] **Step 2: Probe the setup endpoint (first-user creation)**

Umami 3.x exposes first-user setup at `/api/auth/setup` OR `/api/setup` — confirm which. An already-provisioned Umami (admin exists) returns a specific error; a fresh one accepts the POST.

Run:
```bash
# Check current state — does an admin exist?
docker exec umkmcepat-postgres psql -U postgres -d umami -t -c 'SELECT count(*) FROM "user";' | tr -d ' \n'
```
Expected: a number (likely `1` from the earlier session). If `1`, setup will be rejected; if `0`, setup is available.

Then probe (replace credentials as needed; this only runs against your local container):
```bash
curl -s -i -X POST http://localhost:3001/api/auth/setup \
  -H 'Content-Type: application/json' \
  -d '{"username":"probe","password":"probepass"}' | head -20
```
Record: status code + JSON body shape. If admin already exists, expect `400` with a body like `{"error:"User already exists"}` or similar — note the exact message (Task 2's auth-drift branch matches on it).

Also try `/api/setup` as a fallback if `/api/auth/setup` 404s.

- [ ] **Step 3: Probe the login endpoint**

Run:
```bash
curl -s -i -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"umkmcepat"}' | head -30
```
Record: status (expect `200`), the `Set-Cookie` header name (e.g. `umami.auth` / `auth` / `session`), and the JSON body shape. This confirms the cookie name Task 2 must capture + reuse.

- [ ] **Step 4: Probe list-websites with the captured cookie**

Take the `Set-Cookie` value from Step 3 (everything before `;`). Run:
```bash
curl -s -i http://localhost:3001/api/websites \
  -H 'Cookie: <paste-cookie-here>' | head -40
```
Record: status (expect `200`), the JSON shape (`{data: [{id, name, domain, ...}]}` or `[{id, name, ...}]`). The script parses this to find `name === "UMKM Cepat"`; confirm the `id` field name.

- [ ] **Step 5: Probe create-website**

Run:
```bash
curl -s -i -X POST http://localhost:3001/api/websites \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <paste-cookie-here>' \
  -d '{"name":"probe-website","domain":"localhost"}' | head -20
```
Record: status (expect `200` or `201`), the returned `id` field name + shape. Then delete the probe so the real run stays clean:
```bash
curl -s -X DELETE http://localhost:3001/api/websites/<probe-id> -H 'Cookie: <paste-cookie-here>'
```
(If DELETE 404s, leave the probe — the script's idempotency check will skip it since `name !== "UMKM Cepat"`.)

- [ ] **Step 6: Paste findings into Task 2**

No commit (read-only task). Update Task 2's code blocks below with the verified paths, cookie header name, and response field names. If any endpoint differs from the spec's assumption, the spec's data-flow section is the source of truth for *intent*; the code follows the *actual* API.

---

### Task 1: Add `UMAMI_*` env vars + `provision:analytics` script entry

Scaffolds the config the script reads. Own commit — env + package.json together since the script entry references the env var the script reads.

**Files:**
- Modify: `.env` + `.env.example` — add 2 vars in the OPTIONAL section near L139 (where `NEXT_PUBLIC_UMAMI_*` already live).
- Modify: `package.json` — add one script entry.

**Interfaces:**
- Consumes: nothing.
- Produces: `UMAMI_ADMIN_PASSWORD` + `UMAMI_BASE_URL` declared in both env files; `bun run provision:analytics` wired (will fail until Task 2 lands — expected).

- [ ] **Step 1: Re-scan siblings (collab mandate before touching `.env`/`package.json`)**

Run: `herdr pane list | grep -E 'agent_status|terminal_title'` (or `herdr pane list` + read titles). Confirm no sibling owns `.env` or `package.json` right now. The admin-dashboard agent `wZ:pR` committed to NOT touching `.env` (DB-config falls back to existing env) — re-verify by reading its pane output if uncertain.

If any sibling IS mid-edit on `.env`/`package.json`, defer this task until they ACK clear.

- [ ] **Step 2: Add the 2 vars to `.env.example`**

Open `.env.example`. Find the Umami block (currently L139-140):
```
NEXT_PUBLIC_UMAMI_WEBSITE_ID=""
NEXT_PUBLIC_UMAMI_SCRIPT_SRC=""
```
Add a comment + 2 new lines immediately ABOVE the existing 2, so the block reads:
```
# Umami analytics (self-hosted; scripts/provision-analytics.ts provisions admin + website).
# UMAMI_BASE_URL: dev = local container; prod = https://umami.<yourdomain>.
# UMAMI_ADMIN_PASSWORD: dev empty = default "umami" + warn; prod required (script errors if empty).
UMAMI_BASE_URL="http://localhost:3001"
UMAMI_ADMIN_PASSWORD=""
NEXT_PUBLIC_UMAMI_WEBSITE_ID=""
NEXT_PUBLIC_UMAMI_SCRIPT_SRC=""
```

- [ ] **Step 3: Mirror to `.env`**

Open `.env`. Apply the identical 4-line block (comment + 2 new vars + existing 2) in the same position. `.env` keeps the same values as `.env.example` for these (empty `UMAMI_ADMIN_PASSWORD`, localhost base) — the operator fills the prod password at deploy time.

- [ ] **Step 4: Add the `provision:analytics` script to `package.json`**

In the `"scripts"` object, add (alphabetical-ish near other `bun scripts/*` entries, e.g. after `simulate-payment`):
```json
"provision:analytics": "bunx tsx scripts/provision-analytics.ts",
```

- [ ] **Step 5: Verify the gate passes on the staged files**

Run: `bun run check:commit`
Expected: PASS (Prettier + ESLint on `.env.example` is not linted, but `package.json` is — ensure valid JSON). If `package.json` JSON is malformed, fix + re-run.

- [ ] **Step 6: Commit**

```bash
git add .env .env.example package.json
git commit -m "feat(analytics): declare UMAMI_* env vars + provision:analytics script

Wire the config that scripts/provision-analytics.ts (next commit) reads:
UMAMI_BASE_URL (dev localhost default, prod URL) + UMAMI_ADMIN_PASSWORD
(dev empty = default 'umkmcepat' + warn, prod required). Mirrored 1:1 in
.env + .env.example. package.json gets the bunx tsx entry that runs the
script once it lands.

```

---

### Task 2: Implement `scripts/provision-analytics.ts` (idempotent, HTTP-only)

The script itself. ~120 lines, no deps, matches `scripts/simulate-payment.ts` style. End-to-end manual verification is Task 3.

**Files:**
- Create: `scripts/provision-analytics.ts`

**Interfaces:**
- Consumes: `UMAMI_BASE_URL`, `UMAMI_ADMIN_PASSWORD`, `GENERATED_PUBLIC_ORIGIN` from `process.env` (Bun auto-loads `.env`).
- Produces: writes `NEXT_PUBLIC_UMAMI_WEBSITE_ID` + `NEXT_PUBLIC_UMAMI_SCRIPT_SRC` into `.env`. Exit 0 on success, non-zero on any error.

- [ ] **Step 1: Re-scan siblings before creating the file**

`scripts/provision-analytics.ts` is NEW (no sibling owns it), but confirm via `herdr pane list` that no sibling is touching `scripts/` generally. Quick title scan is enough.

- [ ] **Step 2: Write the script**

Create `scripts/provision-analytics.ts`. Use the verified endpoints/cookie-name/response-fields from Task 0. Below is the full implementation — substitute the Task 0 findings where the comments mark `// TASK 0:`:

```typescript
/* eslint-disable no-console */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = resolve(process.cwd(), ".env");
const USERNAME = "admin";
const WEBSITE_NAME = "UMKM Cepat";

async function main() {
  const base = process.env.UMAMI_BASE_URL || "http://localhost:3001";
  const prod = process.env.NODE_ENV === "production";
  let password = process.env.UMAMI_ADMIN_PASSWORD;

  if (!password) {
    if (prod) {
      console.error("UMAMI_ADMIN_PASSWORD is required in production. Set it in .env.");
      process.exit(1);
    }
    console.warn("⚠ UMAMI_ADMIN_PASSWORD empty — using dev default 'umami'.");
    password = "umami";
  }

  const domain = process.env.GENERATED_PUBLIC_ORIGIN || "localhost";

  // --- Phase B: provision (idempotent, REST only, Bearer token) ---

  // Login → 200 {token, user} means admin exists. 401 = wrong password (NOT
  // "admin missing" — Umami 3.2.0 has no anonymous setup endpoint; admin is
  // seeded by the postgres init SQL at first boot). Exit on 401, don't fall back.
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password }),
  });
  if (loginRes.status === 401) {
    console.error(
      `Login failed (401): wrong username/password. If the dev admin was created with a different password, set UMAMI_ADMIN_PASSWORD in .env to match. Umami 3.2.0 has no setup endpoint to reset it via this script — reset via the Umami DB directly.`,
    );
    process.exit(1);
  }
  if (!loginRes.ok) {
    console.error(`Login failed (${loginRes.status}): ${await loginRes.text()}`);
    process.exit(1);
  }
  const loginBody = (await loginRes.json()) as { token: string };
  if (!loginBody.token) {
    console.error("Login response had no token field.");
    process.exit(1);
  }
  const authHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${loginBody.token}`,
  };

  // List websites → 200 {data:[...], count, ...}. Unwrap .data. Find by name.
  const listRes = await fetch(`${base}/api/websites`, { headers: authHeaders });
  if (!listRes.ok) {
    console.error(`List websites failed (${listRes.status}): ${await listRes.text()}`);
    process.exit(1);
  }
  const listBody = (await listRes.json()) as { data?: Website[] };
  const websites = listBody.data ?? [];
  let website = websites.find((w) => w.name === WEBSITE_NAME);

  // Create only if missing → 200 {id, name, domain, ...}.
  if (!website) {
    const createRes = await fetch(`${base}/api/websites`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: WEBSITE_NAME, domain }),
    });
    if (!createRes.ok) {
      console.error(`Create website failed (${createRes.status}): ${await createRes.text()}`);
      process.exit(1);
    }
    website = (await createRes.json()) as Website;
  }

  const scriptSrc = `${base}/script.js`;

  // --- Phase C: write .env (idempotent, atomic) ---
  writeEnv({
    NEXT_PUBLIC_UMAMI_WEBSITE_ID: website.id,
    NEXT_PUBLIC_UMAMI_SCRIPT_SRC: scriptSrc,
  });

  console.log(
    `✓ Umami provisioned — websiteId=${website.id}, scriptSrc=${scriptSrc}, .env updated. Restart dev/app to load.`,
  );
}

type Website = { id: string; name: string; domain?: string };

function writeEnv(updates: Record<string, string>) {
  if (!existsSync(ENV_PATH)) {
    console.error(".env not found. Run `cp .env.example .env` first.");
    process.exit(1);
  }
  const original = readFileSync(ENV_PATH, "utf8");
  const lines = original.split("\n");
  const handled = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (match && updates[match[1]] !== undefined) {
      lines[i] = `${match[1]}="${updates[match[1]]}"`;
      handled.add(match[1]);
    }
  }
  for (const [key, value] of Object.entries(updates)) {
    if (!handled.has(key)) {
      lines.push(`${key}="${value}"`);
    }
  }
  const tmp = `${ENV_PATH}.tmp`;
  writeFileSync(tmp, lines.join("\n"));
  renameSync(tmp, ENV_PATH);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
```

Notes on the code above (reconciled with Task 0 findings — no further API verification needed before implementing):
- Auth is **Bearer token**, captured from the login response `token` field, sent as `Authorization: Bearer <token>` on list/create. No cookie handling.
- The `Website` type uses `id` (verified field name).
- The list-response unwrap reads `.data` (verified `{data:[...]}` shape).
- Login `401` is a real wrong-password failure — exit with a clear message pointing to `UMAMI_ADMIN_PASSWORD` + manual DB reset. Umami 3.2.0 has **no setup endpoint** to bootstrap/reset anonymously, so there is no setup-fallback branch.

- [ ] **Step 3: Typecheck + lint the new file**

Run: `bunx tsc --noEmit scripts/provision-analytics.ts && bun run lint`
Expected: PASS. If `tsc` complains about `Website` type or `headers.Cookie`, fix. ESLint should be clean (the `no-console` disable covers console use).

If `tsc` isn't wired for single-file checks (project uses `vite` not `tsc` directly), run `bun run check:fast` instead — it runs typecheck across the project.

- [ ] **Step 4: Format check**

Run: `bun run format:check`
Expected: PASS on the new file. If it fails, run `bun run format` then re-check.

- [ ] **Step 5: Commit**

```bash
git add scripts/provision-analytics.ts
git commit -m "feat(analytics): idempotent Umami provisioner (admin + website + .env wire)

scripts/provision-analytics.ts: HTTP-only, no deps, no Docker/Prisma coupling.
Phase A resolves config (prod-required password guard, dev-default 'umkmcepat'
+ warn). Phase B provisions idempotently — login → setup-on-401 → list websites
→ create-if-missing. Phase C writes NEXT_PUBLIC_UMAMI_* into .env atomically
(tmp + rename). Auth-drift branch exits clear instead of looping.

```

---

### Task 3: Docs sync + end-to-end manual verification

Updates `docs/deployment.md` (stale dev-off wording + the provision step) and runs the spec's manual checklist to prove the whole thing works.

**Files:**
- Modify: `docs/deployment.md` — L167 wording fix + add provision line under the Umami paragraph.

**Interfaces:**
- Consumes: the landed script (Task 2) + env vars (Task 1).
- Produces: docs in sync with behavior; verified working integration.

- [ ] **Step 1: Re-scan siblings before touching `docs/deployment.md`**

`docs/deployment.md` is NOT on any sibling's list (`wZ:pR` owns `docs/architecture.md`, different file). Quick `herdr pane list` title scan confirms no surprise.

- [ ] **Step 2: Fix the stale dev-off wording**

Open `docs/deployment.md`. Find L167 in the Monitoring section:
```
Usage/behavior analytics: **Umami** (self-hosted in `docker-compose.prod.yml`, shares the platform Postgres) — pageviews + custom events via `src/lib/analytics.ts` `track()`. Dev-off; prod-on via `NEXT_PUBLIC_UMAMI_*`. Never on `/api/*` or `/p/<slug>` (generated sites are the user's, not the platform's to instrument).
```
Replace `Dev-off; prod-on via \`NEXT_PUBLIC_UMAMI_*\`.` with:
```
Fires whenever `NEXT_PUBLIC_UMAMI_WEBSITE_ID` is set (dev or prod); dev `.env` points at a local Umami container, prod at the prod instance — no cross-pollution.
```
Keep the rest of the sentence (Never on `/api/*`...) unchanged.

- [ ] **Step 3: Add the provision step under the Umami paragraph**

Immediately after the Umami paragraph (now updated), add a new line:
```
After first `docker compose -f docker-compose.prod.yml up -d umami`, run `bun run provision:analytics` once to create the admin account + website and write the Website ID into `.env`. Idempotent — safe to re-run after wipes/upgrades (skips existing admin/website, preserves data + password).
```
Leave the Uptime Kuma paragraph (L169) unchanged — Kuma stays manual per the spec.

- [ ] **Step 4: Bring up Umami locally (if not already up)**

Run: `docker compose -f docker-compose.prod.yml up -d umami`
Then: `curl -s -o /dev/null -w '%{http_code}' http://localhost:3001`
Expected: `200`.

- [ ] **Step 5: Wipe any prior admin/website for a clean first-run test**

Only if you want to test the true first-run path (skip if you're fine testing against the existing admin from the earlier session — the script is idempotent either way). To wipe:
```bash
docker exec umkmcepat-postgres psql -U postgres -d umami -c 'DELETE FROM "user"; DELETE FROM website;'
```
⚠ This destroys Umami data. Don't do it on a prod Umami. Local only.

- [ ] **Step 6: Run the provisioner with empty password (dev-default path)**

Ensure `UMAMI_ADMIN_PASSWORD=""` in `.env`. Run: `bun run provision:analytics`
Expected output:
```
⚠ UMAMI_ADMIN_PASSWORD empty — using dev default 'umkmcepat'.
✓ Umami provisioned — websiteId=<uuid>, scriptSrc=http://localhost:3001/script.js, .env updated. Restart dev/app to load.
```
Exit code 0.

- [ ] **Step 7: Verify `.env` was written**

Run: `grep NEXT_PUBLIC_UMAMI .env`
Expected: both lines populated with non-empty values:
```
NEXT_PUBLIC_UMAMI_WEBSITE_ID="<uuid>"
NEXT_PUBLIC_UMAMI_SCRIPT_SRC="http://localhost:3001/script.js"
```

- [ ] **Step 8: Verify the script tag loads + fires (end-to-end)**

Run `bun run dev`. Open the homepage in a browser. Open DevTools → Network. Filter `umami` or `script.js`.
Expected: `script.js` loads 200, and on navigation a `POST /api/send` (or `GET /api/send`) to `localhost:3001` returns 200.
Then open `http://localhost:3001` → log in (`admin` / `umkmcepat`) → the website "UMKM Cepat" → Live view shows a pageview within ~5s.

- [ ] **Step 9: Verify idempotency (re-run changes nothing)**

Run `bun run provision:analytics` again.
Expected: same success line, NO new website created (count in Umami UI stays 1), `.env` values unchanged. The login path fires (not setup), the GET-finds-website path fires (not POST).

- [ ] **Step 10: Verify the prod guard**

Run: `NODE_ENV=production bun run provision:analytics` (with `UMAMI_ADMIN_PASSWORD` still empty).
Expected: exits non-zero with `UMAMI_ADMIN_PASSWORD is required in production. Set it in .env.` No `.env` write, no API call.

- [ ] **Step 11: Format + lint the docs change**

Run: `bun run format:check`
Expected: PASS on `docs/deployment.md`.

- [ ] **Step 12: Commit**

```bash
git add docs/deployment.md
git commit -m "docs(deployment): fix dev-off wording + add provision:analytics step

analytics.ts now fires in dev when NEXT_PUBLIC_UMAMI_WEBSITE_ID is set, so
the old 'Dev-off; prod-on' line was stale. Updated to describe the dev/prod
env-split behavior. Added the one-line provision step (run provision:analytics
after first umami up -d) so first-deploy ops are documented inline.

```

---

## Self-Review (run before handing off)

**1. Spec coverage:**
- Problem (admin/website/env manual) → Task 2. ✓
- Non-goals (Kuma manual, no dashboard, no route, no shell, no self-check) → respected; no task creates them. ✓
- Architecture + boundary (HTTP-only, no Docker/Prisma, writes only `.env`) → Task 2 code matches. ✓
- Data flow (Phase A/B/C) → Task 2 implements all three. ✓
- Env vars (2 new + 2 existing) → Task 1. ✓
- package.json entry → Task 1 Step 4. ✓
- docs/deployment.md (2 changes) → Task 3 Steps 2-3. ✓
- Idempotency + error handling (all branches) → Task 2 code: login/setup/retry, list/create, prod guard, atomic write, auth-drift exit. ✓
- Coordination (disjoint from sibling) → Global Constraints + Step 1 re-scans in each task. ✓
- Testing (manual checklist) → Task 3 Steps 4-10. ✓

**2. Placeholder scan:** No TBD/TODO. All code blocks are complete. Task 0's "paste findings" is intentional (de-risk step, not a placeholder) — the implementer runs the curls and records real output. The `// TASK 0:` comments in Task 2's code are explicit reconciliation points, not vague TODOs.

**3. Type consistency:** `Website` type defined once in Task 2, used consistently. `headers` object shape consistent across login/setup/list/create. `writeEnv` signature `(Record<string, string>)` matches both call sites. Cookie capture helper `captureCookie` defined + called at all three auth branches.

**4. One gap fixed inline:** Task 0 exists *because* the spec assumed endpoints I hadn't verified. Rather than guess in the code (placeholder smell) or freeze the plan waiting for info, Task 0 does the verification as a real step with real curls, and Task 2's code explicitly marks where Task 0's findings plug in. This is the honest way to handle a verified-but-not-yet-confirmed API.

No issues remain.

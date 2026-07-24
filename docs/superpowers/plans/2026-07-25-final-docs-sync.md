# Final Docs Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Must run after topics 1–8 ship.**

**Goal:** Reconcile every canonical doc + `.env.example` with the shipped reality of the 8-topic batch so a 0-context agent reads truth.

**Architecture:** Read each doc against shipped code; fix stale claims; document new surfaces; add the 2 missing R2 env vars; ensure `.env`/`.env.example` 1:1; append a CHANGELOG entry. Docs-only — no behavior change.

**Tech Stack:** Markdown, `.env.example`. No dependencies.

**Spec:** `docs/superpowers/specs/2026-07-25-final-docs-sync-design.md`

## Global Constraints

- Runs LAST, after topics 1–8 ship.
- Docs-only (+ `.env.example`/`.env` 1:1). No code/behavior change.
- `.env`/`.env.example` stay 1:1: `diff <(sed 's/=".*"/=""/' .env.example) <(sed 's/=".*"/=""/' .env)` → no output.
- Visible product copy Indonesian; dev docs English.
- Frequent atomic commits to `dev`. Conventional-commit, body ≤100 chars, `Co-Authored-By: Claude <noreply@anthropic.com>`.

---

## File Structure

- Modify: `README.md`, `DEV.md`, `CLAUDE.md`/`AGENTS.md`, `PRINCIPLES.md` (if stale), `PRODUCT.md`, `DESIGN.md`, `CONTRIBUTING.md`, `docs/architecture.md`, `docs/deployment.md`, `CHANGELOG.md`.
- Modify: `.env.example` + `.env` (add the 2 missing R2 vars, keep 1:1).
- Review (prune only if stale): `docs/research/*`, `docs/superpowers/specs+plans`.

---

### Task 1: Add the 2 missing R2 env vars (1:1)

**Files:**
- Modify: `.env.example`, `.env`

- [ ] **Step 1: Add `PROJECT_ASSET_STORAGE_PROVIDER` + `PROJECT_ASSET_R2_PREFIX`** to `.env.example` OPTIONAL section (after the R2 block, before AI timeouts), one-liner comments matching the R2 plan's declared shape:

```env
# Project display-media storage (local | r2; r2 = public R2 for business-image/logo).
PROJECT_ASSET_STORAGE_PROVIDER="local"
# R2 key prefix for project assets (mirrors OBJECT_STORAGE_R2_PREFIX / PROJECT_ARTIFACT_R2_PREFIX).
PROJECT_ASSET_R2_PREFIX="project-assets"
```

- [ ] **Step 2: Add the same block to `.env`** (1:1; `.env` may have `PROJECT_ASSET_STORAGE_PROVIDER="local"` real value).

- [ ] **Step 3: Verify 1:1**

Run: `diff <(sed 's/=".*"/=""/' .env.example) <(sed 's/=".*"/=""/' .env)`
Expected: no output.

- [ ] **Step 4: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add .env.example
git commit -m "docs(env): add PROJECT_ASSET_STORAGE_PROVIDER + PROJECT_ASSET_R2_PREFIX (1:1)"
```

---

### Task 2: Reconcile docs/architecture.md

**Files:** `docs/architecture.md`

- [ ] **Step 1: Read** the architecture doc + the shipped code for each new surface.
- [ ] **Step 2: Update** the provider-boundary table (add the R2 display-media boundary → `src/lib/r2-client.ts`; add the email/OTP rows; confirm the storage/runtime/auth rows reflect the Sentry removal + the new `/media/<assetId>` public route + `/admin` page). Add a one-line "Cleanliness contract" pointer to DEV.md if not already there.
- [ ] **Step 3: Commit**

```bash
git add docs/architecture.md
git commit -m "docs(arch): reconcile boundaries (r2-client, /media, /admin, email/OTP)"
```

---

### Task 3: Reconcile docs/deployment.md

**Files:** `docs/deployment.md`

- [ ] **Step 1: Confirm** the monitoring section (GlitchTip note from the Sentry removal) is accurate.
- [ ] **Step 2: Add/confirm** the R2 env vars (`OBJECT_STORAGE_PROVIDER`, `PROJECT_ASSET_STORAGE_PROVIDER`, `PROJECT_ARTIFACT_STORAGE_PROVIDER`) in the prod env list; confirm the prod-Compose R2 bucket + `umkmcepat-prod` config-only swap is documented.
- [ ] **Step 3: Commit**

```bash
git add docs/deployment.md
git commit -m "docs(deploy): reconcile R2 vars + GlitchTip note"
```

---

### Task 4: Reconcile DEV.md (cleanliness contract + boot commands)

**Files:** `DEV.md`

- [ ] **Step 1: Confirm** the "Cleanliness contract" section (topic 6) is present; if not, add it (per the topic-6 plan's DEV.md task).
- [ ] **Step 2: Confirm** the self-explanatory-code rule (line 8) is intact.
- [ ] **Step 3: Commit**

```bash
git add DEV.md
git commit -m "docs(dev): confirm cleanliness contract + self-explanatory-code rule"
```

---

### Task 5: Reconcile CLAUDE.md/AGENTS.md (boot instructions)

**Files:** `CLAUDE.md`/`AGENTS.md`

- [ ] **Step 1: Update** the "Read first" list to mention the new surfaces an agent must read before touching them: R2 client (`src/lib/r2-client.ts`), `/media/<assetId>` route, `/admin` waitlist page, mobile chrome (`MobileNav` + `mobile-sheet`), email/OTP adapters (`src/lib/email.ts`, `src/lib/otp.ts`), the cleanliness contract in DEV.md.
- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md AGENTS.md
git commit -m "docs(agents): boot instructions reference new surfaces (r2/media/admin/mobile/email)"
```

---

### Task 6: Reconcile README.md (user-facing positioning)

**Files:** `README.md`

- [ ] **Step 1: Update** the intro to the SEO-grounded positioning (`Website UMKM yang ketemu pembeli`) + the actual feature set (AI builder, free, R2-backed media, mobile-native, waitlist, QRIS/Pakasir). Keep it concise.
- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): SEO-grounded positioning + feature set"
```

---

### Task 7: Reconcile PRODUCT.md + DESIGN.md (if stale)

**Files:** `PRODUCT.md`, `DESIGN.md`

- [ ] **Step 1: Read** PRODUCT.md + DESIGN.md against shipped reality.
- [ ] **Step 2: Update** only stale claims (e.g. design tokens if the dark-rollback changed the surface, product positioning if it drifted from the SEO copy). If nothing's stale, skip + note.
- [ ] **Step 3: Commit** (only if changed)

```bash
git add PRODUCT.md DESIGN.md
git commit -m "docs(product/design): reconcile with shipped reality"
```

---

### Task 8: CHANGELOG.md entry

**Files:** `CHANGELOG.md`

- [ ] **Step 1: Append** a single entry summarizing the 8-topic batch (R2, photo-upload, waitlist admin, mobile, prettier-on-gen, cleanliness, email/OTP, polish+security). Keep it a high-level summary, not a commit log.
- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): 8-topic batch summary"
```

---

### Task 9: Final 1:1 + gate

- [ ] **Step 1:** `diff <(sed 's/=".*"/=""/' .env.example) <(sed 's/=".*"/=""/' .env)` → no output.
- [ ] **Step 2:** `bun run check` green.
- [ ] **Step 3:** Manual 0-context read of `CLAUDE.md` + `DEV.md` + `docs/architecture.md` correctly predicts where R2, `/media`, `/admin`, mobile chrome, email/OTP live.

---

## Post-implementation

- The roadmap is fully shipped + documented. The autonomous phase is complete.
- `docs/research/*` + `docs/superpowers/specs+plans` stay as the decision trail (don't prune unless obviously stale).
- **Deferred go-live infra (documented, not code):** domain + Cloudflare DNS/HTTPS + `GENERATED_PUBLIC_ORIGIN` + Google Search Console registration + generated-runtime-in-prod gate (intentionally off, static-only is correct for UMKM). GLM-4.7-Flash combo: SKIP (user confirmed current combo is fine).

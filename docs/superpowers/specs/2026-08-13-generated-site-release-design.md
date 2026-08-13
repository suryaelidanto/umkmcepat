# Generated Site Release Design

## Goal

Ship one verified Aisyah Collection Muslim Jakarta landing build, then release the generation hardening from `dev` to `main` without unbounded retries.

## Scope

- Keep the AI writer in contract mode: one editable `src/routes/index.tsx` file.
- Select the retail catalog recipe for the accepted `retail` archetype.
- Normalize deterministic defects before validation: empty/hash primary CTA, wrong preview-ready import, disabled-photo placeholders.
- Preserve Indonesian customer copy and accepted WhatsApp target `08123456789`.
- Record source, dist, browser evidence, and build IDs.
- Run bounded qualification and release checks.

Out of scope: authenticated UI impersonation, new product features, generated-artifact hand editing, visual redesign of the platform, new dependencies.

## Acceptance metrics

Hard gates:

- `bun run check`: 6/6 checks pass — format, lint, typecheck, tests, Knip, docs.
- One fresh attempt reaches `succeeded`; project reaches `ready` / `passed`.
- Source gate findings: 0.
- Browser assertions: 24/24 pass — 12 assertions at mobile and desktop.
- Console errors: 0; broken images: 0; broken internal links: 0; overflow: <=1 px.
- Visible WhatsApp CTA: present; target normalizes to `https://wa.me/628123456789...`; every CTA target is at least 44x44 px.
- Required populated site fields rendered: 100%; internal/spec-copy leaks: 0; placeholders: 0 when uploads are disabled.
- Persisted source snapshot: non-empty; compiled dist artifact: non-empty; preview: HTTP 200 with visible content; thumbnail: present.
- Visual quality: no critical/high unresolved finding; deterministic platform routes may skip advisory critic sampling after source/browser gates pass.
- Release: commit and push `dev`, green CI; merge/push `main`, green CI; local branch returned to `dev`.

Operational bounds:

- One fresh rebuild after the final code changes.
- Writer/format/targeted repair budget remains bounded at the existing limits.
- Deterministic contract routes skip advisory visual-critic sampling after source/browser gates pass; AI-generated routes retain one visual repair maximum.
- No retry after a terminal failure without a new root cause and a new failing regression test.

## Design

The accepted handoff remains the only source of business facts. `compileGeneratedSiteContract` derives public copy and recipe data. `buildBatchedWriterPrompt` emits a compact contract-specific prompt, avoiding the large scaffold manifest and gold-example payload that caused truncation. `normalizeBatchedSiteAnchors` performs only deterministic, reviewed transformations; it does not invent facts when the contract lacks a CTA target.

Qualification stays layered: source gates, Vite build, browser gates at 390x844 and 1440x1000, risk classification, then bounded visual review. Deterministic contract routes are accepted after source/browser gates; AI-generated routes may receive one visual repair. A repair must return only the implicated route; the resulting route is normalized and rebuilt before browser evidence is accepted. Failed qualification leaves the candidate snapshot for diagnosis and never marks it ready.

## Evidence

The final report must include the attempt ID, build ID, snapshot ID, source/dist refs, project status, browser assertion totals, gate evidence refs, preview response, thumbnail ref, local check result, commit SHA, and CI run ID. No success wording is allowed without fresh command output confirming the metric.

## Failure handling

- AI parse/format failure: use the existing bounded repair path; terminal failure records the exact safe error and retains staged source.
- Source gate failure: repair only implicated files; no platform-owned file emission.
- Build failure: do not deploy; retain source snapshot and build log.
- Browser failure: do not deploy; retain report and screenshots.
- Visual repair failure: do not loop; report the unresolved finding and stop.
- Release/CI failure: follow the repository CI-fix workflow, then re-run the affected gate.

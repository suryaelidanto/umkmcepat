# Contract-driven multi-page generation

**Date:** 2026-08-16
**Status:** Approved for implementation in the live contract-v1/V2 generation path

## Problem

The build contract already has `visitorJobs` and the generated-site contract already exposes route obligations, but the live contract planner always creates one default visitor job. It also adds `/katalog` from a keyword heuristic, which can create a second page without an accepted customer job. The live reference-calibrated V2 writer then restricts the model to `src/routes/index.tsx`, while the scaffold router remains hard-coded to the root route.

That combination makes the accepted plan and the generated source disagree. It also prevents a real discussion turn from proving a multi-page site end to end.

## Decision

Carry explicit visitor jobs from the discussion-owned brief through the deterministic contract and plan, then make the existing V2 writer route-aware.

The model may record a visitor job only when the owner has stated a distinct outcome. The server normalizes and bounds the list, requires exactly one primary job, and never invents jobs from keywords. A single explicit job produces exactly one root page. Additional accepted jobs produce additional routes, up to the platform route limit; exceeding that limit fails closed.

The existing professional-static V3 benchmark path and its intentionally unapproved release manifest remain unchanged. This change closes the live contract-v1/V2 path used by normal builds.

## Data flow

```text
owner discussion
  -> ProjectBrief.visitorJobs
  -> ProjectBriefV2.visitorJobs
  -> BuildContractV1.visitorJobs
  -> BuildPlanV1.pages
  -> GeneratedSiteWriterContractV2.obligations.routes
  -> V2 route files + generated shared shell
  -> platform-compiled src/router.tsx
```

`visitorJobs` uses the existing contract shape: a stable id, owner-supplied goal, and `primary` or `secondary` priority. The brief and canonical brief use the same shape so legacy consumers cannot silently discard the decision.

Normalization is server-owned:

- trim and slug-normalize ids;
- keep non-empty goals bounded to the existing brief text limits;
- deduplicate ids;
- allow at most one primary job and at most two secondary jobs;
- reject an explicitly supplied list with no primary job or more than the supported route count;
- preserve input order after the primary job;
- use the existing single primary default only when the brief contains no explicit visitor-job list.

The discussion tool schema and internal prompt will describe visitor jobs as an optional structured patch. The prompt will tell the model to emit a secondary job only for a distinct customer outcome, and never to infer one from a product keyword or fabricate an operational fact.

## Deterministic page planning

`buildPlanFromContract` will derive the root page from the primary job and one additional page from each secondary job. It will not create pages solely because a goal contains `menu`, `katalog`, or similar text.

Route slugs are deterministic and bounded. Known job intents map to useful Indonesian routes such as `/katalog`, `/lokasi`, or `/pesan`; other safe goals receive a stable slug. Collisions receive a numeric suffix. Each page carries the visitor job that justifies it and only fact ids already present in the contract. The root page remains the primary conversion page. Navigation is derived from the resulting pages.

The planner will keep the existing contract and plan validators as the trust boundary. The plan must cover the primary job, may not reference unknown jobs/facts/assets, and must fail rather than silently collapse a route. The live generated writer supports one to three routes; a plan beyond that limit is rejected before generation.

## V2 writer and router

The V2 writer prompt will compute writable paths from the accepted route obligations:

- `/` -> `src/routes/index.tsx` exporting `HomeRouteComponent`;
- each additional safe route -> its corresponding `src/routes/<slug>.tsx` export;
- more than one route -> `src/components/site/generated-shell.tsx` for shared navigation/layout.

The writer will receive every accepted route and must emit every required route file. It will use `site.*` as the only customer-data source, preserve the accepted CTA and sections, call `usePreviewReady()` in every route, and use shared-shell navigation without inventing labels or facts. The response parser will stop only after all required editable paths are closed. The multi-route editable budget is 48 KiB; the single-route budget remains 32 KiB.

The platform will compile `src/router.tsx` from the accepted route bindings rather than asking the model to edit the router. The compiler will validate root-first ordering, safe static paths, exact route-file mapping, valid export names, duplicate routes, and the one-to-three route bound. Every accepted route and the 404 route will appear in the TanStack route tree.

The source gates will check the combined route source while retaining route-specific failures: every accepted route file exists, exports its expected component, calls `usePreviewReady`, references the contract-backed site data, and is registered by the compiled router. Existing single-route checks remain unchanged. Correction scope will include all writable route files when a multi-route candidate needs the shared correction; protected files remain forbidden.

## Evidence and failure handling

The focused tests will prove:

1. one job plans one page, and explicit distinct jobs plan more than one page;
2. invalid or over-limit jobs fail closed;
3. the V2 prompt lists every route and the shared shell only for multi-route contracts;
4. the response parser requires every writable path;
5. the router compiler registers every accepted route and rejects unsafe bindings;
6. source gates reject missing route files/hooks/registrations;
7. the full unit suite stays green.

The real proof will use a fresh project and a real discussion/build HTTP flow. The evidence will be generated by the application itself and will include the persisted brief/contract/plan, generated source tree, router registration, HTTP preview responses for every route, screenshots, `/media/<id>` and thumbnail/admin checks where applicable. No generated DB state, source, screenshot, or evidence file will be hand-edited.

Auth proof will use a fresh valid local session through the allowed local login/signing path. Secrets remain process-local and will not be logged, written to docs, or committed.

## Non-goals

- Do not approve or switch the professional-static V3 release manifest.
- Do not change the accepted single-page proof or deterministic control path.
- Do not infer customer facts, routes, or pages from keywords alone.
- Do not let the writer edit the router, content module, theme, runtime, or preview hook.
- Do not weaken existing browser, source, contract, or byte-budget gates.

## Verification gate

Implementation is complete only after the focused red/green tests, `bunx vitest run`, `bun run check`, the literal authenticated HTTP generation proof, CI on `dev`, CI on `main`, and a clean synchronized `dev` worktree all pass. The release decision and final claims must be based on fresh command output.

# Superpowers Docs

Decision trail for specs, plans, handoffs, and tickets. These files are not all current.

## How to Read

- Start with `AGENTS.md`, `DEV.md`, `PRODUCT.md`, and `DESIGN.md`.
- For non-trivial changes, read the newest relevant spec and plan before editing source.
- Treat older specs/plans as historical unless the current source and root docs still match them.
- If two docs disagree, trust source first, then `DEV.md` for workflow, `PRODUCT.md` for scope, `DESIGN.md` for UI, and `AGENTS.md` for agent boot.
- When behavior changes, update the canonical root doc or add a new dated spec/plan that supersedes the old one.

## Current High-Signal Areas

- Production hardening: `specs/2026-07-28-production-security-hardening-design.md` and `plans/2026-07-28-prod-hardening-phase-*.md`.
- Payment: Mayar replaced Pakasir; see `specs/2026-07-29-mayar-payment-migration-design.md`.
- Storage: local dev and production both use S3-compatible storage through MinIO/R2; see the newest storage specs, then `src/lib/s3-client.ts`.
- Generation runtime: check `src/lib/app-settings-registry.ts`, `src/lib/projects/build-attempt-worker.ts`, and `src/lib/projects/batched-generator.ts`.
- Current generated-site behavior: trust `DEV.md`, `DESIGN.md`, and source first; the 2026-08-13 reference-calibrated and 2026-08-14 design-quality documents are implemented historical foundations.
- Professional landing/static-site successor: `specs/2026-08-15-professional-static-site-generation-design.md` and `plans/2026-08-15-professional-static-site-generation.md`. V3 qualification and the V4 benchmark/calibration tooling are implemented behind blocked release authority; production selection remains disabled until private evidence and owner approval pass.

## Supersession Rule

Do not silently edit old plans into a new reality. If a decision changed, either update the canonical root doc or write a new dated doc that says what it supersedes.

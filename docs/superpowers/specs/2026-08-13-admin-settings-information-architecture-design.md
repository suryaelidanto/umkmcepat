# Admin Settings Information Architecture

Date: 2026-08-13
Status: Approved

## Goal

Make `/admin/settings` distinguish real feature switches from operational tuning. Every surviving feature flag is a boolean ON/OFF control in the always-visible Feature flags section. Numeric and enum settings live in the advanced section that owns their behavior.

This design supersedes the admin-surface portions of:

- `2026-08-06-composer-uploads-direct-edit-flags-design.md`
- `2026-08-12-single-shot-generated-site-quality-design.md`

The underlying upload, direct-edit, and generated-site quality behavior remains authoritative except where this document explicitly changes it.

## Final settings structure

### Feature flags — basic, always visible

- Waitlist onboarding gate
- Streamer mode
- Composer image uploads
- Workspace Ubah mode
- Thumbnail capture

Only boolean ON/OFF settings belong in this category.

### Generated-site quality — advanced

- AI visual critic sample (%)

The UI presents the stored `0..1` value as `0..100%`. Deterministic source and browser checks always run. The percentage only controls deterministic sampling of otherwise-clean builds for an additional AI visual-critic review.

### AI — advanced

- AI models
- AI timeouts
- AI — discuss auto-retry attempts
- Agent step limits

The discuss retry setting remains configurable from `0..5`, defaults to `2`, and moves from Feature flags to AI because it controls AI-call recovery rather than feature availability.

Existing Economics, Booster, Rate limits, Runtime, and Limits sections remain.

## Removed admin controls

### Generated-site quality rollout

Remove `feature.generated_site_quality_rollout`. The generated-site quality pipeline becomes the only path for eligible landing and marketing builds. Interactive apps remain on their existing implementation-spec path. A missing accepted handoff still fails over through the existing eligibility logic; the removed setting no longer disables an otherwise-eligible quality build.

### Discuss parallel moderation

Remove `discuss.parallel_moderation` and permanently start moderation concurrently with safe request preparation. The server must still await and approve the moderation verdict before starting the discuss model response. Moderation failure remains fail-closed.

### Discuss partial tool streaming

Remove `discuss.partial_tool_streaming` and permanently publish best-effort partial assistant text and workspace-card deltas while structured tool input streams.

## Unified image control

`feature.composer_uploads_enabled` becomes the only image feature switch. Remove `feature.builder_photo_enabled`.

When Composer image uploads is ON:

- home and workspace composer attachment controls are available
- upload endpoints accept project images
- discuss may ask photo questions and emit `image_upload` cards
- eligible generated-site builds may use uploaded photos

When it is OFF:

- composer attachment controls are hidden
- project image upload endpoints reject or ignore uploads according to their existing contracts
- discuss must not ask for photos or emit `image_upload` cards
- generated-site contracts use the photo-disabled media strategy

All former `feature.builder_photo_enabled` consumers read `feature.composer_uploads_enabled` instead.

## UI behavior

- Feature flags render before the advanced disclosure.
- No boolean setting remains inside the advanced disclosure.
- Generated-site critic sampling uses a percentage label and percentage input semantics while the API and registry continue storing a bounded `0..1` number.
- Internal admin copy remains English, matching the existing settings registry.
- Saving remains category-scoped and continues to use the existing DB-first settings API and cache invalidation.

## Safety and compatibility

- Existing DB rows for removed keys may remain inert; removing registry entries makes them unavailable through the settings API and admin UI.
- No data migration is required.
- Moderation remains fail-closed and completes before any discuss output starts.
- Generated-site critic sampling remains deterministic by attempt ID.
- The generated-site pipeline still applies only to landing and marketing app kinds with an accepted handoff.

## Verification

Automated tests must prove:

1. The registry has no removed keys.
2. Every Feature flags entry is boolean and basic.
3. Thumbnail capture is a basic Feature flag.
4. Discuss retry belongs to AI advanced settings.
5. Critic sample rate belongs to Generated-site quality and remains bounded `0..1`.
6. The settings helper converts sample fractions to percentages and back without changing unrelated numeric fields.
7. Generated-site eligibility no longer depends on a rollout setting.
8. Discuss moderation starts early but is approved before the worker starts.
9. Partial tool streaming is always active.
10. Photo-question and generated-site photo behavior use the Composer image uploads setting.

Run focused tests during development, then `bun run check` before handoff.

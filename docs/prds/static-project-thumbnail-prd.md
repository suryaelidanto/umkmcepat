# PRD: Static Project Thumbnails

Status: accepted for implementation
Created: 2026-07-10
Updated: 2026-07-10
Owner: Surya
Scope: authenticated home project cards, post-build screenshot capture, thumbnail storage and delivery, fallback and cleanup behavior
Read when: changing project-list previews, generated build completion, project deletion, project artifact/image storage, browser capture, or dashboard performance
Do not read for: interactive workspace preview, public publishing, generated source design, full-page screenshot history, or marketing imagery
Current truth: source code + `PRODUCT.md` + `DESIGN.md` + `docs/architecture.md` + `docs/deployment.md`

## Status History

- 2026-07-10: Accepted after confirming that authenticated home project cards currently render live generated sites through scaled iframes.

## Problem Statement

The authenticated home page currently shows each successful project through a sandboxed iframe pointed at its private preview route. The iframe is visually reduced to a thumbnail, but the browser still loads and executes the generated site's HTML, CSS, JavaScript, fonts, images, and layout work. Lazy loading delays this cost; it does not remove it. A project archive with several visible cards can therefore execute several generated applications just to provide non-interactive visual recognition.

Users only need a recognizable image on the home page. They need a live generated application inside the project workspace, where interaction and review matter. Paying live-runtime cost on an archive card is unnecessary, makes performance scale with visible project count, and expands the amount of generated JavaScript running in an authenticated control-plane page.

The product needs one lightweight, fresh, static thumbnail for each project. A successful build should capture the rendered first viewport once, store only the current image, and let the home page load it as an ordinary image. Projects without a usable thumbnail must retain the existing deterministic gradient mark. Thumbnail failure must never invalidate a successful build or remove the last usable thumbnail.

## Product Outcome

```text
successful generated build
→ render committed dist artifact in an isolated headless browser
→ capture one JPEG first-viewport image
→ atomically replace the project's prior thumbnail
→ home project card loads the static image
```

Fallback:

```text
no thumbnail or image request failure
→ existing deterministic project gradient
```

Interactive preview remains unchanged:

```text
project workspace
→ live artifact-backed iframe/runtime preview
```

## Goals

1. Remove generated-site iframes from authenticated home project cards.
2. Make home preview cost approximately one small image request per visible built project.
3. Capture a real browser-rendered first viewport after every successful generate/edit build.
4. Keep at most one stored thumbnail per project.
5. Preserve the previous thumbnail when capture, validation, storage, or metadata promotion fails.
6. Preserve the existing gradient as the honest fallback when no image is available.
7. Prevent stale builds from replacing a newer project's thumbnail.
8. Keep capture bounded, observable, owner-safe, and independent from build correctness.

## Non-Goals

- Replacing the live workspace preview.
- Capturing every route, breakpoint, theme, or full page.
- Keeping thumbnail history per build.
- Generating social-sharing images or public Open Graph images.
- Building a new distributed queue in the first slice.
- Making thumbnail success a requirement for build success.
- Rendering generated source inside the Next.js control-plane process.
- Backfilling every historical project automatically during deployment.
- Solving lifecycle cleanup for all historical source/dist/runtime artifacts.

## User Stories

1. As a project owner, I want to recognize my website from its card without opening it.
2. As a project owner, I want the home page to remain responsive when I have many projects.
3. As a project owner, I want the card image to reflect my latest successful build.
4. As a project owner, I want the previous good image to remain when a new screenshot fails.
5. As a project owner, I want an intentional gradient instead of a broken image when no screenshot exists.
6. As a project owner, I want deleting a project to remove its thumbnail.
7. As a maintainer, I want only one thumbnail object per project so storage does not grow per build.
8. As a maintainer, I want capture failures isolated from build state.
9. As a maintainer, I want stale capture completion unable to overwrite newer output.
10. As a platform operator, I want capture time, memory, concurrency, output size, and network access bounded.

## Functional Requirements

### FR-1: Real rendered image

The thumbnail must be a JPEG captured from a real browser rendering of the committed dist artifact. It must not be a disguised iframe, synthetic gradient approximation, or client-side DOM reconstruction.

### FR-2: Successful-build trigger

Capture is attempted only after a generated build has succeeded and its dist artifact is available. Both initial generation and later source edits use the same capture boundary.

Failed, canceled, superseded, or artifact-write-failed builds do not trigger thumbnail promotion.

### FR-3: One active image

Storage identity is the project ID, not the build ID:

```text
.data/project-thumbnails/<projectId>.jpg
```

A later successful capture replaces that path. Build IDs may appear in metadata/cache versions, never as accumulating local image filenames.

### FR-4: Atomic replacement

Local writes use a sibling temporary file followed by rename. The active image is replaced only after capture and basic output validation succeed. Temporary files are removed in `finally`/failure paths.

### FR-5: Last-good preservation

Capture failure leaves existing thumbnail bytes and metadata unchanged. A failed build also leaves them unchanged.

### FR-6: Honest fallback

A project without promoted thumbnail metadata renders the existing deterministic gradient. If the image endpoint returns an error or image decoding fails, the client switches to the same gradient without showing broken-image chrome.

### FR-7: Freshness guard

Before metadata promotion, the system verifies that the captured build remains the latest successful build for the project. A slower capture from an older build may finish, but it must not promote its metadata over a newer successful build.

### FR-8: Independent build status

Screenshot work is derived best-effort work. Browser absence, timeout, crash, malformed output, storage error, or metadata error must not turn a successful generated build into a failed build.

### FR-9: Authorized delivery

The thumbnail endpoint authenticates the request and verifies project ownership before reading bytes. Cross-user probing must not reveal thumbnail existence or bytes.

### FR-10: Project deletion cleanup

Project deletion removes thumbnail bytes best-effort after an ownership-scoped database deletion. Cleanup failure is logged without resurrecting or falsely reporting a deleted project.

## Rendering Decisions

- Output format: JPEG.
- Viewport: `1440 × 900`.
- Device scale factor: `1`.
- Capture area: first viewport only.
- JPEG quality: `80` initially.
- Maximum accepted output: `1 MiB`.
- Browser locale: `id-ID`.
- Browser timezone: `Asia/Jakarta` when supported.
- Reduced motion: enabled.
- Animations, transitions, and caret are disabled before capture.
- Wait sequence: DOM loaded, fonts ready for at most one second, bounded short stabilization delay.
- Renderer: disposable Node subprocess; timeout terminates its full process tree.
- Total capture timeout: configurable, default `15_000 ms`.
- Capture concurrency: configurable, default `1`.

The first slice does not add multiple responsive sizes. The card browser can resize the single image efficiently; additional variants become justified only by measured bandwidth or image-quality evidence.

## Runtime and Security Decisions

Generated output remains untrusted.

1. Materialize/read only the committed dist artifact.
2. Serve it through a temporary loopback-only static HTTP server.
3. Open it in a fresh browser context without application cookies, auth headers, or persisted profile state.
4. Never use `file://`.
5. Allow requests to the temporary capture origin plus required `data:`/`blob:` resources.
6. Block external HTTP(S) origins, private-network targets, and cloud metadata endpoints.
7. Apply hard navigation, stabilization, and total timeouts.
8. Close page, context, server, and temporary materialization in cleanup paths.
9. Bound concurrent capture work.
10. Never log generated HTML, secrets, cookies, or raw request headers.

Browser capture belongs to the build plane. The first implementation may invoke the internal capture service after build commit, but it must remain a deep module callable from both build routes and movable to a dedicated worker later.

## Storage and Metadata

Add minimal project metadata:

```prisma
thumbnailRef       String?   @db.Text
thumbnailBuildId   String?
thumbnailUpdatedAt DateTime?
```

A reference preserves provider portability. Initial local form:

```text
project-thumbnail:local:<projectId>
```

Local default:

```env
PROJECT_THUMBNAIL_DIR=".data/project-thumbnails"
```

The image endpoint uses a versioned URL:

```text
/api/projects/<projectId>/thumbnail?v=<thumbnailBuildId>
```

The storage key/path remains stable. The query version changes after promotion, allowing long private cache lifetime without storing multiple server-side images.

R2/provider support may reuse the existing project-artifact provider boundary when implemented. The first local slice must not pretend local disk is durable in production; deployment docs must identify the directory as persistent derived data or document regeneration/fallback behavior.

## API Contract

Authenticated project list data adds:

```ts
{
  buildStatus: string | null;
  id: string;
  thumbnailBuildId: string | null;
  thumbnailRef: string | null;
  title: string;
  updatedAt: Date | string;
}
```

Thumbnail route:

```text
GET /api/projects/:id/thumbnail
```

Success headers:

```http
Content-Type: image/jpeg
Cache-Control: private, max-age=31536000, immutable
X-Content-Type-Options: nosniff
```

Missing metadata/file or unauthorized ownership returns the repository's non-disclosing not-found/authorization behavior. Image bytes are never embedded in project-list JSON or server-rendered HTML.

## UI Decisions

- Replace `ProjectPreviewThumb` iframe with an ordinary image.
- Use `loading="lazy"` and `decoding="async"`.
- Preserve the card's current dimensions, link behavior, ring, and gradient component.
- Use empty image alt text because the linked title already names the project; keep the link's explicit accessible label.
- An image load error switches to `ProjectMark` locally.
- Do not add badges, screenshot timestamps, loaders, or new visual language.
- The change is performance/state behavior, not a card redesign; no new Storybook pattern is required unless implementation extracts a reusable image-fallback component.

## Build Integration

Both current successful-build paths must call one service:

```ts
refreshProjectThumbnail({ artifactRef, buildId, projectId });
```

Required ordering:

```text
dist artifact stored
→ build/deployment/project success committed
→ thumbnail capture attempted
→ bytes atomically replaced
→ latest-build condition checked and metadata promoted
```

For the first slice, awaiting bounded capture after commit is acceptable because correctness and deployability are clearer than detached work that can be terminated when a serverless request ends. The generated build result must already be committed, capture errors must be caught, and user-visible build success must remain intact. A durable queue becomes necessary when measured capture latency, request limits, restarts, or multi-node execution make inline bounded work unreliable.

## Observability

Use structured developer logging for:

```text
thumbnail.capture.started
thumbnail.capture.succeeded
thumbnail.capture.failed
thumbnail.capture.superseded
thumbnail.cleanup.failed
```

Include only project ID, build ID, duration, output byte count, and sanitized failure class/message. Do not log source, screenshot bytes, cookies, or external resource URLs.

## Failure Modes

| Failure                              | Required behavior                                                 |
| ------------------------------------ | ----------------------------------------------------------------- |
| Browser unavailable                  | Build remains successful; retain old thumbnail or gradient        |
| Capture timeout/crash                | Cleanup temporary resources; retain old thumbnail                 |
| External asset blocked               | Capture local artifact state; do not weaken network boundary      |
| Empty/oversized output               | Reject promotion; retain old thumbnail                            |
| Storage write failure                | Retain old thumbnail metadata and bytes                           |
| Metadata update failure              | Do not expose unpromoted image as current; log cleanup/retry need |
| Older capture finishes late          | Reject promotion as superseded                                    |
| Thumbnail file missing               | Endpoint 404; client shows gradient                               |
| Image decode failure                 | Client shows gradient                                             |
| Project deleted during capture       | Reject promotion; remove temporary output                         |
| Thumbnail cleanup fails after delete | Project stays deleted; log orphan cleanup failure                 |

## Testing Decisions

Use vertical TDD slices around public behavior.

1. Storage test: writing twice for one project leaves one final JPEG and no temporary files.
2. Promotion test: failed/superseded capture preserves prior metadata.
3. Route test: owner receives JPEG with private immutable cache headers.
4. Route test: another user cannot read the thumbnail.
5. Project-list test: metadata is returned in initial and paginated results.
6. Component test: metadata renders an image; missing metadata renders gradient; image error falls back.
7. Regression test: project cards contain no iframe.
8. Build integration tests: successful generate/edit attempts schedule capture; failed builds do not.
9. Delete test: owned project deletion requests thumbnail cleanup.
10. Manual QA: build, home image request, rebuild/cache-version change, repeated rebuild with one stored file, browser unavailable fallback.

Real Chromium capture receives one focused integration/manual check. Unit tests inject a capture implementation and do not launch browsers repeatedly.

## Performance Budget

- Home card: no generated HTML/JS execution.
- Typical thumbnail target: `50–200 KiB`.
- Hard thumbnail limit: `1 MiB`.
- One image request per visible built card.
- Capture timeout: `15 s` default.
- Capture concurrency: `1` default.
- Stored image count: at most one per project.
- Build success remains available regardless of capture result.

Success should be verified in browser network/performance tooling: opening home with multiple projects must produce thumbnail image requests, no project preview document requests, and no generated project script execution.

## Implementation Plan

### Slice 1: Data and deterministic storage

1. Add Prisma thumbnail metadata and migration.
2. Add local thumbnail reference parsing, atomic write/read/delete, validation, and tests.
3. Document local directory and durability semantics.

### Slice 2: Authorized delivery and home rendering

1. Add authenticated thumbnail route and tests.
2. Include thumbnail metadata in initial and paginated project queries.
3. Replace iframe with image plus existing gradient fallback.
4. Verify accessibility and absence of preview document/script requests.

### Slice 3: Capture and build hooks

1. Add bounded Chromium capture module using an explicitly installed/located browser runtime.
2. Add isolated loopback artifact serving and external-network blocking.
3. Add latest-successful-build guard and atomic promotion.
4. Call one service from successful generate and edit build paths.
5. Add structured logs and focused tests.

### Slice 4: Cleanup and operational proof

1. Add best-effort thumbnail cleanup on project deletion.
2. Capture one existing project manually or rebuild it.
3. Rebuild repeatedly and prove one file remains.
4. Run targeted tests, `bun run check`, and build only because build/deployment behavior is touched.
5. Update canonical architecture/deployment docs with implemented truth.

## Acceptance Criteria

1. Authenticated home project cards contain no generated-site iframe.
2. A successful generated build attempts a real browser JPEG capture.
3. A later successful build changes thumbnail cache version and replaces the same server-side image.
4. Repeated builds leave at most one thumbnail file/object per project.
5. Failed builds and failed captures preserve the last good thumbnail.
6. Projects without a usable thumbnail display the existing gradient.
7. Broken/missing image responses fall back to the gradient.
8. Stale build capture cannot replace newer thumbnail metadata.
9. Thumbnail bytes are owner-authorized and served as `image/jpeg`.
10. Capture has hard timeout, bounded concurrency, isolated browser state, and restricted network access.
11. Screenshot failure never changes successful build status.
12. Deleting a project performs best-effort thumbnail cleanup.
13. Home network inspection shows image requests instead of preview HTML/generated JavaScript.
14. Relevant tests and `bun run check` pass.

## Rollout and Reversal

Roll out behind:

```env
PROJECT_THUMBNAIL_CAPTURE_ENABLED="true"
```

If capture causes operational problems, disable capture. Existing promoted images continue serving; missing images use gradients. Reverting the home image rendering is not required because the endpoint/fallback remains safe without new captures.

## Open Operational Decisions

Implementation must resolve these from the actual deployment target, not guess:

1. Which Chromium executable is guaranteed in local and production environments?
2. Is the first production target a persistent VPS process or a request-limited serverless runtime?
3. Should thumbnail local storage receive its own mounted volume or share the canonical artifact volume?
4. When R2 is active for project artifacts, should thumbnails use the same provider immediately or remain local until remote image storage is implemented?

These decisions may change the adapter/deployment wiring. They do not change the product contract: static image on home, one current thumbnail per project, gradient fallback, last-good preservation, bounded capture.

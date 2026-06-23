# Project Architecture

UMKM Cepat is a multi-tenant AI builder. It must stay cheap, secure, and maintainable on small VPS infrastructure.

## Strategic decision

UMKM Cepat has one platform application. User projects are data, not separate applications.

```text
One Next.js platform app
One PostgreSQL database
Many Project rows
One shared renderer
Many published project URLs
```

Do not create one Next.js app, process, container, folder tree, or server per user project.

## Mental model

```text
Next.js app      = engine
Project schema   = level data
Renderer         = engine rendering the level
Modules          = allowed mechanics
Published output = static/cacheable projection of project data
```

A broken project must not break the platform or another project.

## Route model

Private builder routes:

```text
/                logged-out prompt or logged-in dashboard
/projects/new   authenticated project creation endpoint/page
/projects/[id]  authenticated workspace for one owned project
```

Future public published routes:

```text
/p/[slug]
/p/[slug]/[[...path]]
```

Future custom domains should resolve to the same renderer by host name. Do not create per-domain apps.

## Data model direction

Current `Project` is the seed model. Future work should evolve toward versioned project schemas:

```text
Project
  id
  ownerId
  title
  prompt
  status

ProjectVersion
  projectId
  schemaJson
  createdAt

ProjectPage
  projectId
  path
  blocksJson

ProjectModule
  projectId
  type
  configJson

ProjectSubmission
  projectId
  moduleId
  dataJson
```

Do not store generated source files as the primary runtime model. Generated code may be an export feature later, not the platform runtime.

## Renderer model

The renderer reads project data and renders approved block/module types.

```text
getPublishedProject(slug)
select page by path
validate schema
render blocks
render modules
```

Block rendering must be failure-isolated:

```text
bad block -> fallback for that block
bad page -> project-level error state
bad project -> 404 or unavailable state
```

Never let one project's invalid data crash the whole app.

## Isolation rules

Use cheap isolation first:

- Validate AI output before saving.
- Store project data by `projectId` and `userId`.
- Check ownership on every private project query.
- Check `published`/slug/domain on public reads.
- Render unknown block types with fallback or skip behavior.
- Catch render failures at block/page boundaries.
- Rate limit public writes and AI actions.
- Do not evaluate user JavaScript.
- Do not dynamically import user-generated files.
- Do not let user code access the database, filesystem, network, or secrets.

Containers are not the default isolation boundary for untrusted user code. Plain Docker is not enough for arbitrary untrusted server logic.

## Fullstack feature strategy

UMKM Cepat should feel like it can create fullstack apps, but the first product should do that through safe platform-owned modules.

Examples:

```text
Form
Catalog
Booking
Order
Lead CRM
Table
WhatsApp CTA
Email notification
File upload
Payment link
```

AI composes these modules as schema/config. The platform executes the behavior.

Do not generate arbitrary backend code for the main platform runtime.

## Published output strategy

Prefer static/cacheable output for public traffic.

Phase 1:

```text
Next.js shared renderer reads Project schema from Postgres
```

Phase 2:

```text
Publish renders static/cacheable HTML and assets
Store in object storage or local static output
Serve through Cloudflare/CDN when available
```

Public traffic should not require a warm server per project.

## Future arbitrary code strategy

If the product later needs real user-defined server logic, use an isolate or microVM platform instead of running per-project containers on the VPS.

Preferred future direction:

```text
Cloudflare Workers for Platforms
Deno Subhosting
Firecracker/gVisor-based managed sandbox
```

This is not part of the MVP.

## Resource target

The architecture should handle thousands of deployed projects by keeping project count mostly as database/static-storage growth, not process growth.

Good:

```text
5000 projects = 5000 rows/schemas/static outputs
```

Bad:

```text
5000 projects = 5000 Next.js servers
5000 projects = 5000 Docker containers
5000 projects = 5000 node_modules folders
```

## Non-goals for MVP

- cPanel hosting.
- Kubernetes.
- Microservices split.
- Per-project Next.js deployment.
- Per-project Docker container.
- Arbitrary user backend code.
- User-provided SQL or direct database access.
- Runtime file generation as the source of truth.

## Decision checklist

Before adding project/publish/rendering features, ask:

1. Does this keep one platform app?
2. Is the project represented as data/schema?
3. Can one bad project fail without affecting others?
4. Is user input validated before save/render?
5. Does public traffic stay static/cacheable where possible?
6. Is this avoiding arbitrary user code in the main runtime?
7. Is this still cheap on a small VPS?

If the answer is no, redesign before implementing.

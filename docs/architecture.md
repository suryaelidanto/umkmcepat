# Architecture

Canonical architecture notes for UMKM Cepat. Code is the source of implementation truth; this file records constraints and decisions that should not drift.

## Product model

UMKM Cepat is one AI builder platform for many user projects.

```text
One Next.js platform app
One PostgreSQL database
Many Project rows
One shared renderer/preview path
Many generated artifacts
```

Do not create per-user Next.js apps, per-project containers, arbitrary user backend code, or generated source files as the primary platform runtime.

## Project workspace

Current flow:

```text
prompt -> guided AI discussion -> structured brief -> generated frontend source/build -> private preview
```

Core rules:

- AI clarifies before building when ambiguity changes output quality.
- User projects are data and artifacts, not separate production services.
- Generated source/build artifacts may exist for preview, inspection, repair, export, and future publishing.
- The platform must not execute arbitrary user backend code.
- One bad project must not break the platform or another project.

## Renderer and preview

- Validate AI output before saving or rendering.
- Check ownership on every private project route.
- Serve private preview artifacts with `noindex`.
- Do not dynamically import generated/user files into the Next.js app.
- Do not evaluate user JavaScript in the platform runtime.
- Keep public publishing static/cacheable when possible.

Future public routes should still use the shared platform/renderer model:

```text
/p/[slug]
/p/[slug]/[[...path]]
```

Custom domains should resolve to the same shared publishing path, not separate apps.

## Full-stack direction

UMKM Cepat can feel full-stack through platform-owned modules first:

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

AI may configure these modules. The platform executes them. Arbitrary user backend code is not part of the MVP.

## Provider boundaries

Provider selection is explicit, env-driven, and behind internal adapters.

| Capability | Env                       | Current default           | Boundary                    |
| ---------- | ------------------------- | ------------------------- | --------------------------- |
| Database   | `DATABASE_URL`            | PostgreSQL via Prisma     | `prisma/schema.prisma`      |
| AI         | `AI_PROVIDER`             | 9Router via Vercel AI SDK | `src/lib/ai.ts`             |
| Auth       | Google OAuth + Turnstile  | Google                    | `src/lib/auth.ts`, Auth.js  |
| Rate limit | `RATE_LIMIT_PROVIDER`     | `memory`                  | `src/lib/rate-limit.ts`     |
| Storage    | `OBJECT_STORAGE_PROVIDER` | `local`                   | `src/lib/object-storage.ts` |
| Monitoring | Sentry env                | disabled unless env set   | Sentry config files         |

Rules:

- Business logic imports internal services, not vendor SDKs.
- Provider SDKs stay inside adapter modules.
- Missing optional provider config fails clearly.
- Runtime mocks are not used for real product behavior.
- Add providers only when the product needs them.

## AI gateway

AI requests go through Vercel AI SDK and 9Router:

```text
UMKM Cepat UI -> UMKM Cepat API -> Vercel AI SDK -> 9Router -> provider -> model
```

Local AI gateway:

```bash
bun run infra:ai
```

```text
9Router: http://localhost:20129
Headroom: http://localhost:8787/health
Default dashboard password: 123456
```

Local env:

```env
AI_PROVIDER="9router"
AI_MODELS="cmc/deepseek/deepseek-v4-pro,cmc/deepseek/deepseek-v4-flash,cmc/moonshotai/Kimi-K2.6"
NINE_ROUTER_BASE_URL="http://localhost:20129/v1"
NINE_ROUTER_API_KEY=""
```

Production Compose can use Docker DNS:

```env
NINE_ROUTER_BASE_URL="http://9router:20128/v1"
```

Keep provider keys out of frontend env vars and git.

## Storage

Current implemented storage provider:

```env
OBJECT_STORAGE_PROVIDER="local"
LOCAL_UPLOAD_DIR=".data/uploads"
```

`local` writes uploads under `LOCAL_UPLOAD_DIR`. For VPS/Docker, mount that path as a persistent volume.

Reserved future provider:

```env
OBJECT_STORAGE_PROVIDER="r2"
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET=""
R2_PUBLIC_BASE_URL=""
```

`r2` env placeholders exist, but the adapter intentionally throws until remote object storage is actually needed. When R2 is implemented, runtime storage selection should come from `OBJECT_STORAGE_PROVIDER`; local upload volumes become optional for that deployment.

## Auth

Google OAuth is the login provider. Login is gated by the consent dialog and optional Cloudflare Turnstile.

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY=""
TURNSTILE_SECRET_KEY=""
```

Leave both empty in local development to use the dev check. Set both in production if Turnstile should be enforced.

## Safety checklist

Before changing project, renderer, publishing, generated artifacts, providers, auth, storage, or AI behavior:

1. Does this preserve one platform app?
2. Is user/project data scoped by owner and project?
3. Is untrusted input validated before save/render/execute?
4. Does this avoid arbitrary user backend code in the platform runtime?
5. Are provider details behind adapters?
6. Are secrets kept out of client env, logs, docs, and commits?
7. Is the solution still cheap on small VPS infrastructure?

# Provider Architecture

UMKM Cepat keeps vendor-specific code behind small internal boundaries. Add a provider only when the product needs it.

## Principles

- Build one provider first, not every provider at once.
- Keep provider-specific SDKs inside adapter files only.
- Business logic should import internal services, not vendor SDKs.
- Provider choice should come from environment variables or config.
- Missing optional provider config should fail clearly, not silently.
- Runtime mocks are not used for real product behavior. Tests may use mocks.
- Prefer boring infrastructure and standard protocols.

## Current default choices

| Capability | Current default                | Future-compatible path                               |
| ---------- | ------------------------------ | ---------------------------------------------------- |
| Database   | PostgreSQL via Prisma          | Any PostgreSQL host via `DATABASE_URL`               |
| AI         | 9Router Docker gateway         | Other OpenAI-compatible APIs behind adapter          |
| Auth       | Auth.js / NextAuth with Google | GitHub, Microsoft, email, or other Auth.js providers |
| Rate limit | Memory                         | Redis-backed limiter later                           |
| Monitoring | Optional Sentry                | Any observability provider later                     |

## Adapter rule

Allowed in routes/components/business logic:

```ts
import { checkRateLimit } from "@/lib/rate-limit";
```

Avoid outside adapter files:

```ts
import OpenAI from "openai";
import { VendorStorageClient } from "vendor-storage-sdk";
```

Provider SDKs should live behind internal modules such as:

```text
src/lib/ai.ts
src/lib/rate-limit.ts
```

## Environment-driven configuration

Provider selection should be explicit:

```env
AI_PROVIDER="9router"
RATE_LIMIT_PROVIDER="memory"
```

Provider credentials stay in `.env` locally or deployment secrets. Never commit real values.

## Development priority

Current implementation priority:

1. Keep Prisma/PostgreSQL as-is.
2. Keep Auth.js/Google as-is.
3. Keep AI access behind an internal AI boundary when generation becomes real.
4. Simplify or isolate rate limiting.
5. Add storage, queues, or payments only when product flow requires them.

## Provider migration checklist

When changing or adding a provider:

- Add or update the adapter only.
- Keep public interfaces stable.
- Update `.env.example` when env changes.
- Update the matching provider doc only.
- Add tests for provider-independent behavior.
- Run `bun run check`.
- Do not mix provider migration with unrelated product changes.

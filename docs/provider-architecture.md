# Provider Architecture

UMKM Cepat uses one default provider per capability, but each provider must be replaceable through configuration and a small internal adapter boundary.

The goal is simple development now, without locking the project into one vendor later.

## Principles

- Build one provider first, not every provider at once.
- Keep provider-specific SDKs inside adapter files only.
- Business logic should import internal services, not vendor SDKs.
- Provider choice should come from environment variables or config.
- Missing optional provider config should fail clearly, not silently.
- Runtime mocks are not used for real product behavior. Tests may use mocks.
- Prefer boring, popular, standard infrastructure.
- Prefer standard protocols when possible: PostgreSQL, S3-compatible storage, Redis.

## Current default choices

| Capability     | Current default                | Future-compatible path                                              |
| -------------- | ------------------------------ | ------------------------------------------------------------------- |
| Database       | PostgreSQL via Prisma          | Any PostgreSQL host via `DATABASE_URL`                              |
| AI             | 9Router Docker gateway         | OpenAI, Anthropic, Gemini, or OpenAI-compatible APIs behind adapter |
| Object storage | Cloudflare R2                  | AWS S3, MinIO, local storage via storage adapter                    |
| Auth           | Auth.js / NextAuth with Google | GitHub, Microsoft, email, or other Auth.js providers                |
| Rate limit     | Current/simple implementation  | Redis-backed limiter later                                          |
| Queue          | None for now                   | BullMQ + Redis when real background jobs exist                      |
| Payment        | None for now                   | Midtrans, Xendit, Stripe later                                      |
| Monitoring     | Optional Sentry                | Any observability provider later                                    |

## Adapter rule

Allowed in routes/components/business logic:

```ts
import { generateLandingPageContent } from "@/lib/ai";
import { storage } from "@/lib/storage";
```

Avoid outside adapter files:

```ts
import OpenAI from "openai";
import { VendorStorageClient } from "vendor-storage-sdk";
import { S3Client } from "@aws-sdk/client-s3";
```

Provider SDKs should live behind internal modules such as:

```text
src/lib/ai/
src/lib/storage/
src/lib/rate-limit/
src/lib/queue/
```

## Environment-driven configuration

Provider selection should be explicit:

```env
AI_PROVIDER="9router"
STORAGE_PROVIDER="r2"
RATE_LIMIT_PROVIDER="memory"
QUEUE_PROVIDER="none"
```

Provider credentials stay in `.env` locally or deployment secrets. Never commit real values.

## Development priority

Current implementation priority:

1. Document provider choices and required env vars.
2. Move AI provider logic behind an internal AI boundary.
3. Keep storage access behind the storage boundary.
4. Keep Prisma/PostgreSQL as-is.
5. Keep Auth.js/Google as-is.
6. Simplify or isolate rate limiting.
7. Add BullMQ only when there is a real queue use case.

## Provider migration checklist

When changing or adding a provider:

- Add or update the adapter only.
- Keep public interfaces stable.
- Update `.env.example`.
- Update docs.
- Add tests for provider-independent behavior.
- Run `bun run verify`.
- Do not mix provider migration with unrelated product changes.

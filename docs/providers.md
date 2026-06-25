# Providers

Provider selection is controlled by `.env`. Registered provider names live in `src/lib/provider-registry.ts`.

## Current defaults

| Capability | Env                       | Current default |
| ---------- | ------------------------- | --------------- |
| AI         | `AI_PROVIDER`             | `9router`       |
| Rate limit | `RATE_LIMIT_PROVIDER`     | `memory`        |
| Auth       | Google OAuth + Turnstile  | Google          |
| Storage    | `OBJECT_STORAGE_PROVIDER` | `local`         |

## Auth

Google OAuth is the login provider. The login modal can use Cloudflare Turnstile before starting OAuth.

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY=""
TURNSTILE_SECRET_KEY=""
```

Leave both empty in local development to use the dev check. Set both in production if Turnstile should be enforced.

## AI

Current runtime provider: Vercel AI SDK using `9router` as the OpenAI-compatible backend.

```env
AI_PROVIDER="9router"
AI_MODELS="cmc/deepseek/deepseek-v4-pro,cmc/deepseek/deepseek-v4-flash,cmc/moonshotai/Kimi-K2.6"
NINE_ROUTER_BASE_URL="http://localhost:20129/v1"
NINE_ROUTER_API_KEY=""
```

`AI_MODELS` is comma-separated. The first model is the default. All AI calls, streaming, tool calling, and structured output must go through the Vercel AI SDK boundary in `src/lib/ai.ts`.

Registered future provider names: `openai`, `anthropic`, `gemini`.

## Rate limit

Current implemented providers:

- `memory`
- `none`

Registered future provider name: `redis`.

```env
RATE_LIMIT_PROVIDER="memory"
```

## Storage

Current implemented provider:

- `local`

Registered future provider name: `r2`.

```env
OBJECT_STORAGE_PROVIDER="local"
LOCAL_UPLOAD_DIR=".data/uploads"
```

Local storage is for development or a VPS/Docker deployment with a persistent volume. It writes uploaded files under the ignored upload directory and serves private profile avatars through `/api/profile/avatar`.

R2 placeholders are available in `.env.example`, but the runtime adapter is intentionally not enabled until remote object storage is needed.

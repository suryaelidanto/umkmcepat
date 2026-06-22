# Observability

UMKM Cepat has optional Sentry wiring for server and edge runtime errors.

Local development does not require Sentry. Leave Sentry env vars empty unless you are testing monitoring.

## Files

```text
sentry.server.config.ts
sentry.edge.config.ts
```

Both files read DSN values from environment variables.

## Local env

Use empty values by default:

```env
SENTRY_DSN=""
NEXT_PUBLIC_SENTRY_DSN=""
```

## Production env

Set these in deployment secrets, not in git:

```env
SENTRY_DSN="https://example.ingest.sentry.io/project-id"
NEXT_PUBLIC_SENTRY_DSN="https://example.ingest.sentry.io/project-id"
```

If source maps are uploaded during production builds, set the auth token only in CI/deployment secrets:

```env
SENTRY_AUTH_TOKEN="sntrys_..."
```

Never commit `SENTRY_AUTH_TOKEN`.

## Security rules

- Do not commit `.env.sentry-build-plugin`.
- Do not commit Sentry auth tokens.
- Do not put Sentry auth tokens in frontend env vars.
- DSNs are less sensitive than auth tokens, but this project still keeps them configurable through env for portability.

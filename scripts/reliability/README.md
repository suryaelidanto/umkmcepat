# Reliability harness

Local tools for builder reliability (unstuck recovery, batch E2E, stress).

## Env (never commit secrets)

```bash
export RELIABILITY_BASE_URL="https://dev.umkmcepat.com"
# Header Cookie string (Secure cookies only work on tunnel HTTPS, not bare localhost)
export RELIABILITY_COOKIE="$(cat cookie.header.txt)"
# optional override if base URL origin differs
# export RELIABILITY_ORIGIN="https://dev.umkmcepat.com"
```

Create `cookie.header.txt` (gitignored) as a single Cookie header line from a logged-in browser session. Mutations need matching `Origin` (harness sets it from base URL).

## Commands

```bash
# Mode resolution unit tests (no network)
bun test src/lib/projects/resolve-generate-mode.test.ts
bun test src/lib/projects/generate-mode-edge.test.ts

# Stress smoke (runtime GETs + optional project list) — needs server + cookie for auth paths
bun run scripts/reliability/stress-100.ts

# Batch E2E: FormData create → DB brief → generate → poll runtime (burns energy)
bun run scripts/reliability/run-batch.ts --count 5 --batch 1
# optional: --chaos (extra retry_build after ready), --timeout-ms 600000
```

Reports write to `tmp/` (gitignored).

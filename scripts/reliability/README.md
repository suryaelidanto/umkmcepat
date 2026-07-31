# Reliability harness

Local tools for builder reliability (unstuck recovery, batch E2E, stress).

## Env (never commit secrets)

```bash
export RELIABILITY_BASE_URL="http://127.0.0.1:3000"
export RELIABILITY_COOKIE="your-session-cookie"  # optional for authenticated API runs
```

## Commands

```bash
# Mode resolution unit tests (no network)
bun test src/lib/projects/resolve-generate-mode.test.ts

# Stress smoke (runtime GETs + optional project list) — needs server + cookie for auth paths
bun run scripts/reliability/stress-100.ts

# Batch E2E (creates real projects; burns energy) — needs cookie + AI + infra
bun run scripts/reliability/run-batch.ts --count 5 --batch 1
```

Reports write to `tmp/reliability-report.json` (gitignored).

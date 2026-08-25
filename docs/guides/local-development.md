# Local Development Guide

## Prerequisites

- [Bun](https://bun.sh) (v1.2+)
- Docker (for PostgreSQL / MinIO local storage)

## Quick Start

```bash
bun install
cp .env.example .env
bun run infra
bun run db:migrate
bun run dev
```

## Quality Gates

Run checks before committing:

```bash
bun run check    # Parallel check: locks + routes + format + lint + typecheck + tests + Knip + discipline + docs
bun run verify   # Full verification suite before release
```

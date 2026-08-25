# Architecture Overview

UMKM Cepat generates standalone, production-ready Vite + React + Tailwind websites for Indonesian small businesses from a conversational brief.

## Core Flow

1. **Discuss (`/api/projects/:id/chat/turn`)**: Conversational intake via Vercel AI SDK extracting a structured canonical brief.
2. **Build (`/api/projects/:id/generate`)**: Outcome-directed generation engine with Sandboxed Agent loop writing React components and TanStack Router pages.
3. **Preview (`/api/projects/:id/preview/*`)**: Sandboxed runtime preview iframe rendering the generated project.
4. **Edit (`/api/projects/:id/chat/turn`)**: Natural language and visual canvas feedback loop running localized surgical edits.
5. **Publish (`/api/projects/:id/publish`)**: Standalone static export to Cloudflare R2 / CDN with zero vendor lock-in.

## Subsystems

- `src/lib/projects/agentic-generator.ts`: Autonomous agent generator executing tools (`write_file`, `check_app`, `impeccable_review`, etc.).
- `src/lib/projects/scaffold/`: Base UI starter kit and vendored shadcn Base Nova UI component registry.
- `src/lib/projects/impeccable/`: Dynamic OKLCH palette seeds, contrast checkers, typography, and unslop design review.
- `src/lib/payment/user-credits.ts`: Strict energy accounting with fail-closed balance boundaries.

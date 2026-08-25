# Development Guide & Engineering Standards

Workflow and engineering standards for UMKM Cepat. For high-level design principles, read `PRINCIPLES.md`.

---

## 1. Core Engineering Rules

- **Domain before file type**: Organize all features by product area or domain first. Never use generic catch-all folders (`hooks`, `utils`, `helpers`, `misc`). Local hooks, schemas, types, and helpers live beside the feature.
- **Colocated tests**: Single-module unit and component tests sit directly beside the source (`foo.ts` + `foo.test.ts`). Top-level `tests/` is strictly for cross-domain (`tests/unit`), real DB integration (`tests/integration/*.itest.ts`), browser audits (`tests/browser/*.browser.test.ts`), and test harnesses (`tests/support`).
- **Zero `any`**: `any` disables the type-checker. Use `unknown` with explicit narrowing or Zod parsing. Never commit `@ts-ignore` or `eslint-disable`.
- **Never test stochastic output, classNames, or HTML markup**: Unit and component tests must assert data structures, Zod schemas, and deterministic contracts. Never assert exact className strings, Tailwind utility lists, HTML tag trees, anchor strings, model answer wording, palette hues, or AI generated snapshots. Testing markup or styling creates rigid template-ish generator behavior. Rendered aesthetic quality belongs to visual inspection.
- **Single-line comments only**: Write self-explanatory code. Never narrate code, write block comments, or draw ASCII banners (`// ---`). Authored comments delete by default. Keep only strictly necessary single-line explanations for non-obvious invariants.
- **Fail loud at trust boundaries**: Validate untrusted input at server boundaries, check object ownership on every mutation, and fail closed on auth, payment, or publishing failures.
- **English for developer surfaces, Indonesian for user copy**: Developer tools, errors, logs, prompts, comments, and documentation are strictly in English. Customer-facing product UI copy is in Indonesian.
- **No secrets in tracked files**: Environment variables, API keys, tokens, and credentials belong only in `.env` (gitignored). Documentation examples use empty `""` values.
- **Task Tracking in `docs/notes/backlog.md`**: Living project backlog is maintained as an Obsidian-compatible Kanban board. When picking up tasks:
  1. Move item from `## Backlog` $\rightarrow$ `## In Progress`.
  2. Implement code and verify with `bun run check`.
  3. Move item from `## In Progress` $\rightarrow$ `## Done`.

---

## 2. Quality Gates & Fast Local Loop

Run `bun run check` locally before committing:

```bash
bun run check        # Fast cached parallel check: locks + routes + format + lint + typecheck + tests + Knip + discipline + docs
bun run verify       # Full verification suite before release
```

Individual focused commands:

```bash
bun run typecheck    # TypeScript compiler check
bun run lint         # ESLint check
bun run format:check # Prettier check
bun run check:knip   # Dead exports and unused file detector
bun run check:discipline # Anti-pattern and directory layout scanner
```

---

## 3. Architecture & Code Conventions

### Folder Organization

**GREAT (Feature-bounded domain):**

```text
src/
  components/
    projects/
      workspace/
        WorkspaceShell.tsx
        WorkspaceHistoryDrawer.tsx
        WorkspacePrimitives.tsx
        useWorkspaceState.ts
      chat/
        ChatMessage.tsx
        ComposerAttachments.tsx
  lib/
    projects/
      build-attempt-worker.ts
      build-attempt-worker.test.ts
      snapshots.ts
      snapshots.test.ts
```

**BAD (Scattered catch-alls):**

```text
src/
  hooks/
    useWorkspaceState.ts
  utils/
    snapshots.ts
  components/
    WorkspaceShell.tsx
    ChatMessage.tsx
```

---

### Type Safety & Narrowing

**GREAT:**

```ts
export function parseProjectConfig(raw: unknown): ProjectConfig {
  const result = projectConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid project configuration: ${result.error.message}`);
  }
  return result.data;
}
```

**BAD:**

```ts
export function parseProjectConfig(raw: any): ProjectConfig {
  return raw as ProjectConfig;
}
```

---

### AI Testing Rules (Deterministic Invariants Only)

**IRON LAW:** Never write TDD or unit tests that assert AI model prose, answer wording, Indonesian phrasing, taste, palette hues, fonts, layout structure, card counts, section sequences, or generated source snapshots.

**GREAT (Asserting schema, type boundaries, and safety):**

```ts
describe("presentWorkspaceCardTool", () => {
  it("validates tool arguments matching schema", () => {
    const input = {
      assistantText: "Halo, nama tokomu apa?",
      workspaceCard: {
        type: "question",
        question: {
          id: "business_name",
          question: "Apa nama toko kamu?",
          answerMode: "text",
          required: true,
          selectionMode: "single",
          options: [],
        },
      },
    };
    const parsed = presentWorkspaceCardInputSchema.safeParse(input);
    expect(parsed.success).toBe(true);
  });
});
```

**BAD (Pinning model phrasing or creative taste):**

```ts
describe("discuss output", () => {
  it("says exactly this text", () => {
    expect(response.text).toBe("Hai! Aku bantu bikinin toko online ya.");
  });
});
```

---

### Component Styling & Tokens

- Reusable application design system components live in `src/components/ui/`.
- Use Tailwind v4 semantic tokens (`bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`, `border-border`, `ring-ring`) rather than arbitrary hardcoded hex codes.
- Use `cn()` from `@/lib/utils` for conditional class joining.

---

## 4. Local Infrastructure

Full local stack via Docker Compose:

- **Postgres**: Application database
- **Redis**: BullMQ job queues and pub/sub events
- **9Router / Headroom**: AI proxy and rate limiting
- **MinIO**: S3-compatible local object storage (port `9000`)

```bash
bun run infra         # Start local containers
bun run db:migrate    # Run database migrations
bun run dev           # Start Vite dev server on port 3000
bun run dev:reset     # Safely reset port 3000 if occupied
bun run infra:down    # Stop local containers
```

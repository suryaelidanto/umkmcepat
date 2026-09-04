---
name: bulletproofing
description: Use when auditing, organizing, refactoring, or elevating codebase architecture, domain boundaries, naming conventions, thin routes, and type safety to production-grade standards.
---

# Bulletproofing

The definitive architecture, domain organization, and codebase perfection standard.

A senior engineer values simplicity, durability, predictable organization, and unshakeable consistency. Code is read ten times more often than it is written. Sloppiness, arbitrary folder structures, mixed concerns, fat route files, and loose types compound into coordination debt. This skill guides AI agents and developers to audit deeply, plan meticulously, and refactor surgically—leaving zero loose ends.

---

## 1. The Perfectionist Engineering Mindset

1. **Allergic to Sloppiness**: Feel uncomfortable when encountering arbitrary naming, duplicated logic, leaky boundaries, unvalidated network data, or 1,000-line route files. Fix the root cause, never patch the symptom.
2. **Exhaustive over Fast**: Quality and durability beat quick superficial checks. Never "sample 3 files" and call an audit complete. Inspect every file in the target domain systematically using deterministic commands.
3. **Boring is Beautiful**: Prefer obvious, predictable, readable code over clever abstractions. If code is not needed today, delete it.
4. **Colocation over Categorization**: Place files where they are used, not by their technical file extension.
5. **Two-Phase Integrity (Iron Law)**:
   - **Phase 1**: Diagnose exhaustively, produce a structured proposal, and **STOP**. Never mutate code without explicit user approval.
   - **Phase 2**: Refactor surgically in behavior-preserving increments, verify with automated tooling, and commit atomically.

---

## 2. Reference Library (Deep Architectural Modules)

For deep implementation specifications, refer to the companion modules in `references/`:

- [**01 — Architecture Matrix & Boundaries**](./references/01-architecture-matrix.md): Three-layer topology, unidirectional flow, thin routes, and domain colocation.
- [**02 — Data Layer Contract (Triple-Threat)**](./references/02-data-layer-contract.md): Zod validation schemas, pure fetchers, and TanStack Query with guaranteed cache invalidation.
- [**03 — Decision Tree: Split vs. Colocate**](./references/03-decision-tree.md): The 4 mandatory reasons to split and 3 strict rules against splitting (anti-LOC trap).
- [**04 — Resilience, Error Boundaries & Security**](./references/04-resilience-and-security.md): Localized error boundaries, error classification, PBAC ownership checks, and XSS sanitization.
- [**05 — Performance Patterns & Re-render Defense**](./references/05-performance-patterns.md): `children` prop re-render barrier, state initializer functions, context velocity rules, and route-level lazy loading.
- [**06 — The Audit Toolkit & Command Suite**](./references/06-audit-toolkit.md): Exact shell commands for fat files, loose typing, inline fetch calls, dead code, and the audit scorecard template.

---

## 3. The Iron Naming Law

Inconsistent naming breeds chaos. Every file, folder, and symbol MUST adhere to this exact taxonomy:

| Entity | Format | Example | Rules & Boundary Constraints |
|---|---|---|---|
| **Directories / Folders** | `kebab-case` | `src/components/admin/`, `src/lib/projects/` | Always lowercase letters and hyphens. Never `camelCase` or `PascalCase`. |
| **Banned Directories** | ❌ FORBIDDEN | `hooks/`, `utils/`, `helpers/`, `misc/`, `temp/` | Catch-all buckets are strictly banned. Colocate files directly beside the domain or component they serve. |
| **React Components** | `PascalCase.tsx` | `WorkspaceShell.tsx`, `Card.tsx` | Exactly one primary component per file matching the filename. |
| **Custom Hooks** | `useCamelCase.ts` | `useWorkspaceLayout.ts`, `useWorkspaceChat.ts` | Always prefixed with `use`. Colocated beside the component or domain using it. |
| **Pure Services / Engine** | `kebab-case.ts` | `runtime-supervisor.ts`, `api-client.ts` | Non-React pure TypeScript modules, business engines, or utilities. |
| **Schemas & Contracts** | `kebab-case.ts` | `site-schema.ts`, `project-config.schema.ts` | Zod schemas with exported inferred types colocated in the same file. |
| **Colocated Tests** | `<target>.test.ts(x)` | `WorkspaceShell.test.ts`, `card.test.tsx` | Sits directly next to the source file. Top-level `tests/` is strictly for cross-domain integration and browser suites. |
| **Route Files** | Framework Convention | `_main.admin.settings.tsx`, `api.projects.$id.ts` | Must remain thin delivery shells (≤ 100 lines). Core UI and business logic live in domain modules. |

---

## 4. Phase 1: Exhaustive Diagnostic & Proposal (READ-ONLY)

When invoked to audit or inspect a codebase or domain, execute these steps systematically. **Do not modify any application files during Phase 1.**

### Step 1.1: Automated Inventory & Telemetry
Run project discovery commands to gather hard evidence (see [06-audit-toolkit.md](./references/06-audit-toolkit.md)):
```bash
# 1. Detect dead files, unused exports, orphan types
bunx knip

# 2. Detect forbidden catch-all folders, banned comments, 'any'
bun run check:discipline

# 3. Identify top monolithic oversized files (> 300 LOC)
find src -type f \( -name "*.ts" -o -name "*.tsx" \) ! -name "*.gen.ts" ! -name "*.test.*" -exec wc -l {} + | sort -rn | head -25

# 4. Detect raw unvalidated network calls in UI components
grep -rnE "fetch\(" src/components/
```

### Step 1.2: 7-Pillar Deep Audit
Evaluate the domain against the 7 pillars:
1. **Domain Boundary & Ownership**: Is code organized by product feature? Are there loose flat files that belong in a domain?
2. **Dependency Graph & Direction**: Are there circular imports? Are shared primitives importing domain code?
3. **Thin Route Conformance**: Are route files thin orchestrators ($\le 100$ LOC) or monolithic dumpsters?
4. **State Taxonomy Discipline**: Is server data cached via TanStack Query? Is URL state kept in search params?
5. **Data Layer Contract**: Does every query/mutation follow the Triple-Threat pattern (Zod + Fetcher + Query Options)?
6. **Resilience & Security**: Are there localized error boundaries? Is PBAC ownership enforced on server mutations?
7. **Test Colocation & Determinism**: Are unit tests sitting beside their code? Do tests assert deterministic invariants (never stochastic AI copy or exact Tailwind markup)?

### Step 1.3: Produce the Audit Scorecard & Refactor Proposal
Present findings to the user using the exact scorecard format from [06-audit-toolkit.md](./references/06-audit-toolkit.md):
- Health Status & Passing Test Baseline
- Architectural Highlights
- Prioritized Anti-Patterns Table (`CRITICAL`, `HIGH`, `MEDIUM`)
- Phased Surgical Refactoring Batches

### Step 1.4: THE UNBREAKABLE STOP GATE
**YOU MUST STOP HERE.** Output the proposal and wait for explicit user confirmation. Under no circumstances should you edit, rename, move, or delete files before the user approves.

---

## 5. Phase 2: Surgical Refactor & Verification (AFTER APPROVAL)

Only after receiving explicit approval from the user, execute the agreed-upon batch:

### Step 2.1: Domain Extraction & File Realignment
1. Move or create files according to the Iron Naming Law.
2. Maintain direct imports (avoid barrel `index.ts` files).
3. Follow the Decision Tree ([03-decision-tree.md](./references/03-decision-tree.md)): extract domain hooks and sub-views based on reasons to change and re-render boundaries, preserving single-consumer locality.
4. Keep route files thin by delegating to `<FeatureContainer />`.

### Step 2.2: Colocated Unit Tests
1. For every newly created domain hook, helper, or component, add a colocated test (`foo.test.ts` or `foo.test.tsx`).
2. Adhere strictly to the **Unbreakable Bar**:
   - Never soften assertions.
   - Never test AI model prose, Indonesian phrasing, exact className strings, or HTML tag trees.
   - Assert deterministic invariants: Zod schemas, data types, error handling, state transitions, and business contracts.

### Step 2.3: Verification Gate
Before claiming any work is done, run the complete verification suite:
```bash
bun run check        # Full gate: locks + routes + format + lint + typecheck + tests + knip + discipline + docs
```
If any check fails, fix the root cause immediately.

### Step 2.4: Atomic Commit
Commit locally on the working branch with precise conventional commits:
```bash
git commit -m "refactor(<domain>): <concise active-voice description>"
```
**Never push to remote unless explicitly commanded by the user.**

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
2. **Exhaustive over Fast**: Quality and durability beat quick superficial checks. Never "sample 3 files" and call an audit complete. Inspect every file in the target domain systematically.
3. **Boring is Beautiful**: Prefer obvious, predictable, readable code over clever abstractions. If code is not needed today, delete it.
4. **Colocation over Categorization**: Place files where they are used, not by their technical file extension.
5. **Two-Phase Integrity (Iron Law)**:
   - **Phase 1**: Diagnose exhaustively, produce a structured proposal, and **STOP**. Never mutate code without explicit user approval.
   - **Phase 2**: Refactor surgically in behavior-preserving increments, verify with automated tooling, and commit atomically.

---

## 2. The Iron Naming Law

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

## 3. The Bulletproof Architecture Matrix

Adapted from canonical *Bulletproof React* principles for modern full-stack meta-frameworks (TanStack Start, Next.js App Router, Vite):

```
┌────────────────────────────────────────────────────────────────────────┐
│                      DELIVERY LAYER (Thin Shells)                       │
│  - Routes / Pages / HTTP Endpoints (`src/routes/` or `app/`)           │
│  - Responsibilities: URL params, loaders, server functions, metadata   │
│  - Strictly thin (< 100 LOC): delegates immediately to domain modules   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ imports
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   FEATURE DOMAINS (Core Business Logic)                │
│  - Self-contained domains (`src/components/<domain>/`, `src/lib/<domain>/`)│
│  - Contains: UI components, domain hooks, Zod schemas, state machines  │
│  - 100% Framework Agnostic: can move between Next.js, TanStack, Remix   │
│  - Strict Rule: No horizontal cross-feature imports without shared layer│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ imports
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 SHARED PRIMITIVES & PLATFORM INFRASTRUCTURE            │
│  - Design System Primitives: `src/components/ui/` (Card, Badge, Button)│
│  - Layout Containers: `src/components/common/layout/PageContainer.tsx`  │
│  - Platform Clients: Database (`prisma.ts`), Cache (`redis.ts`), Storage│
│  - Shared Types & Env Configuration                                     │
└────────────────────────────────────────────────────────────────────────┘
```

### Unidirectional Dependency Flow (The Dependency Rule)
- Shared primitives never import from feature domains or routes.
- Feature domains never import from other feature domains directly. (If Domain A needs Domain B, compose them at the Route layer or extract a shared contract into a domain-shared module).
- Delivery routes import from feature domains and shared primitives.

### Thin Route Shell Discipline
Route files are **delivery adapters**, not application dumping grounds.
- **BAD (Fat Route)**: A route file with 800 lines of JSX, inline form states, database queries, and direct CSS styling.
- **GREAT (Thin Route Shell)**:
  ```tsx
  // src/routes/_main.waitlist.tsx (Thin Shell)
  import { createFileRoute } from "@tanstack/react-router";
  import { WaitlistFeature } from "@/components/waitlist/WaitlistFeature";
  import { fetchWaitlistSummary } from "@/lib/waitlist/waitlist-service";

  export const Route = createFileRoute("/_main/waitlist")({
    loader: () => fetchWaitlistSummary(),
    component: WaitlistRoute,
  });

  function WaitlistRoute() {
    const initialData = Route.useLoaderData();
    return <WaitlistFeature initialData={initialData} />;
  }
  ```

### The 5-Tier State Taxonomy
State must be placed in the correct tier—never prematurely globalize:
1. **Local Component State** (`useState`, `useReducer`): UI toggles, open/close dropdowns, draft inputs.
2. **URL State** (Search params, route params): Filters, active tabs, pagination, modal query params (shareable & bookmarkable).
3. **Server Cache State** (TanStack Query): Data fetched from server endpoints. Never copy server data into Redux/Zustand.
4. **Form State** (React Hook Form + Zod): Field values, validation errors, dirty states.
5. **Global Application State** (Zustand / Context): Rare cross-cutting UI state (e.g. active workspace session, toast notifications, auth session).

### Component Composition over Prop Explosion
- Avoid components that take 15+ boolean props (`showFooter`, `withHeader`, `isSmall`, `hasBorder`).
- Prefer composition with `children` or explicit slots (`header={<CustomHeader />}`).
- Avoid nested inline render functions (`function renderItems() { ... }`). Extract into colocated sub-components.

---

## 4. Phase 1: Exhaustive Diagnostic & Proposal (READ-ONLY)

When invoked to audit or inspect a codebase or domain, execute these steps systematically. **Do not modify any application files during Phase 1.**

### Step 1.1: Automated Inventory & Telemetry
Run project discovery commands to gather hard evidence:
```bash
bunx knip                 # Detect dead files, unused exports, orphan types
bun run check:discipline  # Detect forbidden folders, banned comments, 'any'
```
Identify file distribution:
- Find oversized monolithic files (> 400 LOC).
- Find flat directory sprawls (e.g. 30+ files dumped in a root folder without sub-domains).
- Check for duplicate or conflicting component definitions.

### Step 1.2: 7-Pillar Deep Audit
Evaluate the domain against the 7 pillars:
1. **Domain Boundary & Ownership**: Is code organized by product feature? Are there loose flat files that belong in a domain?
2. **Dependency Graph & Direction**: Are there circular imports? Are shared primitives importing domain code?
3. **Thin Route Conformance**: Are route files thin orchestrators or monolithic dumpsters?
4. **State Taxonomy Discipline**: Is server data cached properly, or stored in ad-hoc global stores?
5. **Component Design & Composition**: Are there god-components? Is composition used cleanly?
6. **Type Safety & Schema Boundaries**: Zero `any`. Are network boundaries protected by Zod schemas?
7. **Test Colocation & Determinism**: Are unit tests sitting beside their code? Do tests assert deterministic invariants (never stochastic AI copy or exact Tailwind markup)?

### Step 1.3: Produce the Audit Scorecard & Refactor Proposal
Present findings to the user using this exact structure:

```markdown
### 🏛️ Codebase Architecture Audit Scorecard

**Domain Evaluated:** `<domain-or-all>`
**Overall Health:** `[Healthy | Needs Attention | Critical Tech Debt]`

#### 1. Highlights (What is already solid)
- List clean implementations, robust tests, and good patterns.

#### 2. Architectural Findings & Code Smells
| Location | Current Anti-Pattern | Long-Term Risk / Friction | Recommended Target Pattern |
|---|---|---|---|
| `src/...` | `...` | `...` | `...` |

#### 3. Step-by-Step Surgical Refactor Plan
- **Batch 1: [Name]** - Scope, files affected, colocated tests.
- **Batch 2: [Name]** - Scope, files affected, colocated tests.

---
🛑 **HARD STOP**: Ready to execute. Which batch would you like to proceed with, or should we refine the plan?
```

### Step 1.4: THE UNBREAKABLE STOP GATE
**YOU MUST STOP HERE.** Output the proposal and wait for explicit user confirmation. Under no circumstances should you edit, rename, move, or delete files before the user approves.

---

## 5. Phase 2: Surgical Refactor & Verification (AFTER APPROVAL)

Only after receiving explicit approval from the user, execute the agreed-upon batch:

### Step 2.1: Domain Extraction & File Realignment
1. Move or create files according to the Iron Naming Law.
2. Maintain direct imports (avoid barrel `index.ts` files).
3. If extracting from a monolithic file, extract domain hooks (`use...ts`) and sub-views first, leaving the orchestrator clean.
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

---

## 6. Antipattern Catalog & Target Solutions

### Antipattern A: Flat Directory Sprawl
- **Problem**: 50 flat files in `src/lib/projects/` mixing prompt templates, AST parsers, build workers, and thumbnails.
- **Solution**: Group into cohesive sub-domains:
  - `src/lib/projects/generation/` (prompts, schemas, creative direction)
  - `src/lib/projects/runtime/` (supervisor, proxy, idle runner)
  - `src/lib/projects/assets/` (thumbnails, uploads, media)

### Antipattern B: Fat Route / Controller Bloat
- **Problem**: `src/routes/_main.admin.settings.tsx` has 500 lines of forms, state, and table rendering.
- **Solution**: Extract `<AdminSettingsView />` into `src/components/admin/settings/AdminSettingsView.tsx`. The route file retains only route loaders, metadata, and `<AdminSettingsView />`.

### Antipattern C: Ad-Hoc Styling & Card Reinvention
- **Problem**: Manually styling `border rounded-xl p-4 bg-white dark:bg-[#151515]` in 15 different places.
- **Solution**: Replace with unified design primitive `<Card>`, `<CardHeader>`, `<CardContent>` from `src/components/ui/card.tsx` using semantic tokens.

### Antipattern D: Leaky Server Boundaries
- **Problem**: Importing server-only secrets, Prisma clients, or BullMQ queues into files imported by client components.
- **Solution**: Isolate server modules behind `.server.ts` conventions or dedicated server directories, ensuring bundlers tree-shake them out of client assets.

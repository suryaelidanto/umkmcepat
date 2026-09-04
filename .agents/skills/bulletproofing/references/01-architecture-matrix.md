# 01 — The Bulletproof Architecture Matrix & Domain Boundaries

The architectural blueprint for building scalable, predictable, and indestructible React + TypeScript applications.

---

## 1. The Three-Layer Topology

The codebase is organized into three distinct, non-overlapping architectural layers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      DELIVERY LAYER (Thin Shells)                       │
│  - Location: `src/routes/` (or `app/routes/`)                          │
│  - Role: Framework adapter, route params, loaders, server functions    │
│  - Rule: Strictly thin (< 100 LOC). No direct business or complex UI.  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ imports
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   FEATURE DOMAINS (Core Business Logic)                │
│  - Location: `src/components/<domain>/`, `src/lib/<domain>/`           │
│  - Role: Self-contained business units (UI, hooks, schemas, state)     │
│  - Rule: 100% framework-agnostic. Zero cross-feature horizontal imports│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ imports
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 SHARED PRIMITIVES & PLATFORM INFRASTRUCTURE            │
│  - Location: `src/components/ui/`, `src/components/common/layout/`     │
│  - Role: Design tokens, primitives (Card, Badge, Button), clients      │
│  - Rule: Agnostic of any business domain. Never imports from features. │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. The Unidirectional Dependency Rule

Code flows strictly in one direction:
$$\text{Shared Primitives} \longrightarrow \text{Feature Domains} \longrightarrow \text{Delivery Routes}$$

### Boundary Invariants
1. **Shared Primitives never import from Feature Domains or Routes**:
   `src/components/ui/card.tsx` must never import from `src/components/projects/` or `src/routes/`.
2. **Feature Domains never import from sibling Feature Domains**:
   `src/components/admin/` must never import from `src/components/projects/`.
   - *Why?* Cross-feature coupling creates hidden dependency webs where changing one feature breaks another.
   - *Solution:* If Feature A and Feature B need to collaborate, compose them at the **Delivery Route Layer** or extract the shared contract into `src/lib/common/` or a domain-shared module.
3. **Delivery Routes only orchestrate and render**:
   Routes import from Feature Domains and Shared Primitives to wire URL parameters to domain containers.

---

## 3. Thin Route Shell Discipline (< 100 LOC)

A route file is a delivery adapter, not an application dumping ground.

### Antipattern: Fat Route (God File)
```tsx
// ❌ BAD: 800 lines of JSX, state, form validation, and data queries inside a route
export const Route = createFileRoute("/_main/waitlist")({
  component: function FatWaitlist() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    // 50 lines of submit logic
    // 300 lines of JSX cards, tables, modals
    return <div>...</div>;
  }
});
```

### Target Pattern: Thin Delivery Shell
```tsx
// ✅ GREAT: Route is a lightweight 30-line orchestration adapter
import { createFileRoute } from "@tanstack/react-router";
import { WaitlistFeature } from "@/components/waitlist/WaitlistFeature";
import { fetchWaitlistSummary } from "@/lib/waitlist/waitlist-service";

export const Route = createFileRoute("/_main/waitlist")({
  loader: () => fetchWaitlistSummary(),
  head: () => ({
    meta: [{ title: "Daftar Tunggu — UMKM Cepat" }],
  }),
  component: WaitlistRoute,
});

function WaitlistRoute() {
  const initialData = Route.useLoaderData();
  return <WaitlistFeature initialData={initialData} />;
}
```
*Benefits:* When upgrading or switching meta-frameworks (e.g. TanStack Start $\leftrightarrow$ Next.js $\leftrightarrow$ Remix), 95% of your application code remains untouched. Only the thin route shell changes.

---

## 4. Domain Colocation vs. File-Type Sorting

Group code by **business domain**, never by technical file extension.

### The Banned Directory Anti-Pattern
```
❌ BAD (Scattered Catch-All Buckets):
src/
├── hooks/              # Every hook in the entire company dumped here
│   ├── useWorkspace.ts
│   └── useAdmin.ts
├── utils/              # 80 unrelated helper functions
│   ├── formatCurrency.ts
│   └── parseAst.ts
└── types/              # 100 orphan types
```

### The Feature-Bounded Colocation Standard
```
✅ GREAT (Self-Contained Domain Module):
src/
├── components/
│   └── projects/
│       └── workspace/
│           ├── WorkspaceShell.tsx            # Orchestrator
│           ├── WorkspaceShell.test.ts        # Colocated test
│           ├── WorkspaceNavigation.tsx       # Sub-view
│           ├── WorkspacePreviewPane.tsx      # Sub-view
│           ├── useWorkspaceLayout.ts         # Domain hook
│           ├── useWorkspaceLayout.test.ts    # Colocated hook test
│           ├── useWorkspaceChat.ts           # Domain hook
│           └── workspace-helpers.ts          # Pure domain helpers
```

Every module, its hooks, its types, and its tests live side-by-side. Deleting or refactoring a feature requires touching only one directory.

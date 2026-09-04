# Reference: Testing & Mocking Boundaries

Testing in a production-grade TypeScript full-stack codebase must provide genuine confidence without creating fragile tests that break on refactoring.

---

## 1. The Full-Stack Testing Trophy

```
          /\
         /  \      E2E / Browser Audits (Playwright, tests/browser/)
        /    \     - Real headless browser, critical golden flows
       /──────\
      /        \    Integration / Route Tests (src/routes/-*.test.ts)
     /          \   - Full route handlers, middleware, DB transactions
    /────────────\
   /              \  Component Integration Tests (*.test.tsx)
  /                \ - Render invariants, accessibility, DOM events
 /──────────────────\
/                    \ Unit / Contract Invariants (*.test.ts) - Highest ROI
────────────────────── - Zod schemas, pure business logic, calculations, utils
```

---

## 2. The Boundary Mocking Law

### What to Mock: External System Boundaries Only
Mock ONLY at the edge of the application:
1. **Network / HTTP**: Mock `fetch` or use MSW (Mock Service Worker).
2. **Database**: Mock Prisma client or raw query handlers.
3. **Third-Party Services**: Payment gateways (Midtrans), S3/R2 storage, AI APIs.
4. **Environment Time/Randomness**: System clock (`vi.setSystemTime`), `randomUUID`.

### What NEVER to Mock:
- **Never mock React Internal Hooks**: Do not mock `useState`, `useReducer`, `useEffect`, `useMemo`.
- **Never mock Child Component Internals**: Test the component tree as a user experiences it, or render sub-components directly in isolation.
- **Never mock Internal Domain Helpers**: Do not mock pure utility functions belonging to the same feature. Test the integration between them.

---

## 3. The Iron Law of Invariant Testing

Unit and TDD tests MUST NOT assert:
- AI model prose or wording
- Exact `className` strings or Tailwind utility lists
- HTML tag structures or arbitrary layout wrappers
- Color hexes, palette hues, or fonts

Tests assert deterministic mechanical invariants only:
1. **JSON Schemas (Zod validation)**: Structure, types, and required keys.
2. **Type narrowing and contract error handling**: 400 Bad Request, 401 Unauthorized, 403 Forbidden, 429 Rate Limit.
3. **Hard deterministic boundaries**: Action URLs, route topology, package policies, security headers.
4. **State Machine Transitions**: Pending $\to$ Success $\to$ Error, empty state rendering, disabled button states during submission.

---

## 4. Safe Provider Harness Pattern

When testing components that consume TanStack Query or TanStack Router, wrap with an isolated lightweight test provider rather than importing entire app trees:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";

export function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}
```

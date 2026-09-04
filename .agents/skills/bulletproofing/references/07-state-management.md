# Reference: State Management & The 5 State Tiers

Effective state management in a full-stack React / TanStack application requires categorizing state by its lifecycle and ownership. Never dump everything into a centralized client store.

---

## 1. The 5 State Tiers

```
┌─────────────────────────────────────────────────────────────┐
│ 1. URL State (Address Bar, Search Params, Route Params)     │
│    - Filter, sort, pagination, active tabs, open modal IDs │
│    - Sharable, bookmarkable, reload-proof                   │
├─────────────────────────────────────────────────────────────┤
│ 2. Server Cache State (TanStack Query)                      │
│    - Asynchronous data owned by the server                  │
│    - Automatic deduplication, SWR, background refetch      │
├─────────────────────────────────────────────────────────────┤
│ 3. Form State (Local / React Hook Form / Zod)               │
│    - Ephemeral input buffer, dirty/touched flags            │
│    - Discarded or synced on submit                          │
├─────────────────────────────────────────────────────────────┤
│ 4. Local Component State (useState, useReducer)             │
│    - UI toggles isolated to a single component subtree      │
│    - Tooltip hover, dropdown open, inline accordion state   │
├─────────────────────────────────────────────────────────────┤
│ 5. Global Application State (Zustand / Specialized Stores)  │
│    - Truly cross-cutting client-only state                  │
│    - Audio player, global notification queue, user theme    │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Rules & Boundaries

### Rule 1: Never Mirror Server Cache into Client Stores
- **Anti-Pattern**: Fetching data from the server, then saving it in a Zustand store or `useState` to edit or display it.
- **Why it breaks**: Two sources of truth. Stale data, sync race conditions, and missed cache invalidations.
- **Standard**: Consume TanStack Query directly. If you need derived data, use `select` or `useMemo`.

### Rule 2: Prefer URL State for Navigable UI Controls
- Search filters, pagination cursors, category selections, and drawer open states should live in URL search parameters (e.g. `?page=2&tab=overview`).
- **Benefits**:
  - Refreshing the browser does not reset the user\'s view.
  - Users can copy and share exact links to teammates.
  - Browser Back/Forward buttons work naturally.

### Rule 3: Form State Stays Local Until Submission
- Do not lift form field values to global state while the user is typing.
- Validate on blur or change using standard Zod schemas.
- On successful submission, invalidate relevant server cache keys (`queryClient.invalidateQueries`) and navigate or close.

### Rule 4: Context Velocity Law
- Never place high-frequency changing values (e.g. mouse position, streaming tokens, keystroke state) in a broad React Context that wraps large subtrees.
- Split fast-changing state into isolated leaves or use external stores with selective subscriptions (Zustand selectors).

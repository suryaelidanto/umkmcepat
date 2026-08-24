# Principles

Operating principles for UMKM Cepat. Read this before planning product, design, code, AI, docs, or UI changes.

A senior engineer values simplicity, organization, and durability over clever complexity. If code is not needed today, delete it. If a platform feature solves the problem, use it.

---

## 1. Product & UX

- Build for the job a real user needs to finish, not a speculative feature list.
- One obvious, useful path beats five half-working settings.
- Cut scope before cutting correctness or performance.
- Interface copy in user-facing flows must be plain, active Indonesian.
- Empty, loading, error, and recovery states are core product views, not afterthoughts.

---

## 2. Engineering Mindset & Simplicity

- **YAGNI extremist.** The best code is the code you never wrote.
- Stop at the first rung that holds:
  1. Does this need to exist at all? If no, delete.
  2. Standard library does it? Use standard library.
  3. Native platform feature covers it? Use CSS or database constraints over custom JS.
  4. Existing dependency covers it? Use it; never add a new dependency for what a few lines can do.
  5. Minimum code that works reliably.
- No single-use interfaces, no factories for one product, no config for values that never change.
- A 50-line surgical fix beats a 500-line refactor.

### Examples: Simplicity & Abstraction

**BAD:**

```ts
// Over-engineered factory with single implementation
interface ButtonFactory {
  createButton(type: string): JSX.Element;
}
class PrimaryButtonFactory implements ButtonFactory {
  createButton() { return <Button variant="primary" />; }
}
```

**GREAT:**

```tsx
// Direct, plain component call
export function ActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return <Button onClick={onClick}>{label}</Button>;
}
```

---

## 3. Architecture & Organization

- **Domain before file type.** Group by product feature or business domain (`src/components/admin/`, `src/lib/projects/`). Never create generic catch-all folders (`hooks/`, `utils/`, `helpers/`, `misc/`).
- **Colocated tests.** Place unit and component tests directly beside the file they test (`foo.ts` + `foo.test.ts`). Top-level `tests/` is strictly for cross-domain integration, real DB infrastructure tests, or browser automation.
- **Deep modules, small interfaces.** Hide complex internal logic behind a concise, stable export.

### Examples: Folder Structure

**BAD (Generic bucket anti-pattern):**

```text
src/
  hooks/
    useProjectHistory.ts
    useAdminFilter.ts
  utils/
    formatDate.ts
    calcPrice.ts
```

**GREAT (Domain-driven grouping):**

```text
src/
  components/
    admin/
      AdminFilters.tsx
      useAdminFilter.ts
    projects/
      workspace/
        WorkspaceHistoryDrawer.tsx
        useWorkspaceHistory.ts
```

---

## 4. Zero-Tolerance Type Safety

- **No `any` or `as any`.** `any` disables the compiler and hides runtime bugs.
- Use `unknown` with type narrowing (e.g. `typeof`, `instanceof`, Zod parsing).
- Fix root causes instead of adding `@ts-ignore` or `eslint-disable`.

### Examples: Type Narrowing

**BAD:**

```ts
function parsePayload(data: any) {
  return data.user.id;
}
```

**GREAT:**

```ts
function parsePayload(data: unknown): string {
  if (typeof data === "object" && data !== null && "user" in data) {
    const user = (data as { user: unknown }).user;
    if (typeof user === "object" && user !== null && "id" in user) {
      return String((user as { id: unknown }).id);
    }
  }
  throw new Error("Invalid payload format");
}
```

---

## 5. AI Invariants vs. Model Taste

- **Never test stochastic AI responses or taste in unit tests.**
- Tests assert deterministic mechanical invariants only:
  - Zod schemas and JSON structure
  - Required fields and type narrowing
  - Security policies and route contracts
  - Accessibility contrast and touch target boundaries
- Model wording, copywriting appeal, and layout aesthetics are verified through calibrated review and visual evaluation corpora.

### Examples: Testing AI Systems

**BAD (Pinning stochastic prose or layout taste):**

```ts
// Fragile unit test checking exact LLM prose
expect(aiOutput.text).toBe("Hai! Aku siap membantumu jualan kopi.");
expect(aiOutput.buttonColor).toBe("#b45309");
```

**GREAT (Testing structural contract and schema):**

```ts
// Validating schema invariants and required keys
const parsed = presentWorkspaceCardInputSchema.safeParse(toolInput);
expect(parsed.success).toBe(true);
if (parsed.success) {
  expect(parsed.data.workspaceCard).toBeDefined();
  expect(typeof parsed.data.assistantText).toBe("string");
}
```

---

## 6. Code Cleanliness & Comment Hygiene

- Code must be self-explanatory through expressive naming and clear logic.
- Authored comments delete by default.
- Never write multi-line comment blocks, narrative descriptions, or banner dividers (`// ---`).
- Add single-line comments only when explaining a non-obvious invariant or deliberate simplification that looks wrong but is right.

### Examples: Comments

**BAD:**

```ts
// ----------------------------------------------------
// This function handles the user authentication by
// checking if the session exists in the database
// ----------------------------------------------------
function checkAuth() { ... }
```

**GREAT:**

```ts
// ponytail: auth token expiry grace period of 30s allows clock skew between nodes
const isFresh = tokenIssuedAt + 30_000 > Date.now();
```

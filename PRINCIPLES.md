# Principles

Operating principles for UMKM Cepat. Read this before planning product, design, code, AI, docs, or UI changes.

A senior engineer values simplicity, organization, and durability over clever complexity. If code is not needed today, delete it. If a platform feature solves the problem, use it.

---

## 1. Core Engineering Mindset

- **Optimize for software lifetime**, not just the moment code is written.
- Code is read far more often than it is written. Write for humans first, computers second.
- **Maintainability, readability, testability, operability, debuggability, security, and simplicity are core features.**
- Treat complexity as a cost that compounds over time.
- Treat unnecessary dependencies as future coordination debt.
- Treat every abstraction as something that must earn its existence with at least two real use cases.
- Prefer boring correctness over impressive cleverness.
- Prefer obvious code over ingenious code.
- Prefer explicit intent over hidden intelligence.
- Never follow a pattern merely because it has a famous name.
- Never confuse more architecture with better architecture.
- Never confuse cleverness with elegance.
- Pursue excellence without allowing unattainable perfection to block useful, working improvements.
- Leave every file and domain cleaner than you found it.

---

## 2. Simplicity & YAGNI

- Simplicity is the highest form of engineering sophistication.
- Minimize the number of concepts a developer must hold in memory simultaneously.
- Isolate essential complexity; ruthlessly delete incidental complexity.
- Do not solve problems that do not exist today.
- Do not build speculative infrastructure or extension points without proven variation.
- Do not introduce configuration when a sensible default works.
- Do not create layers that merely forward calls, or wrappers that hide nothing.
- Code that does not exist cannot contain bugs or break in production.
- Make the correct path obvious and easy; make misuse and invalid states difficult or impossible to represent.

### Examples: Simplicity & Abstraction

**BAD (Over-engineered factory with single implementation):**

```ts
interface ButtonFactory {
  createButton(type: string): JSX.Element;
}
class PrimaryButtonFactory implements ButtonFactory {
  createButton() { return <Button variant="primary" />; }
}
```

**GREAT (Direct, plain, zero-indirection component):**

```tsx
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

## 3. Architecture & Domain Organization

- **Domain before file type**: Group by product feature or business domain (`src/components/admin/`, `src/lib/projects/`). Never create generic catch-all folders (`hooks/`, `utils/`, `helpers/`, `misc/`, `temp/`, `stuff/`).
- **Colocated tests**: Single-module unit and component tests sit directly beside the file they test (`foo.ts` + `foo.test.ts`). Top-level `tests/` is strictly for cross-domain integration, real DB infrastructure, or browser automation.
- **Deep modules, small interfaces**: Hide complex internal logic behind a concise, stable export.

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

- **No `any` or `as any`**. `any` disables the compiler and hides runtime bugs.
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

- **Never test stochastic AI responses or taste in unit tests (Iron Law)**.
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

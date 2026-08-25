---
name: codebase-steward
description: Use when auditing, organizing, simplifying, refining, or perfecting the codebase architecture, type safety, test invariants, directory layout, comment hygiene, and unslop engineering standards.
disable-model-invocation: true
---

# Codebase Steward

Autonomous workflow for auditing and perfecting the codebase according to senior engineering standards.

A senior engineer values simplicity, organization, and durability over clever complexity. If code is not needed today, delete it. If a platform feature solves the problem, use it. Always leave the codebase cleaner than you found it.

---

## 1. The Audit Checklist

Run through these 7 verification gates when inspecting, refactoring, or perfecting any domain:

### Gate 1: Directory & Domain Discipline
- **Rule**: Domain before file type.
- **Check**: No generic catch-all folders (`hooks/`, `utils/`, `helpers/`, `misc/`, `temp/`, `stuff/`).
- **Fix**: Move feature-local hooks, contexts, types, schemas, and helpers directly beside the feature they serve.

### Gate 2: Colocated Unit & Route Tests
- **Rule**: Single-module tests sit directly beside the source file (`foo.ts` + `foo.test.ts`).
- **Check**: Top-level `tests/` contains only cross-domain integration (`tests/unit`), real DB infra (`tests/integration/*.itest.ts`), browser audits (`tests/browser/*.browser.test.ts`), and test harnesses (`tests/support`).

### Gate 3: Zero-Bypass Type Safety
- **Rule**: Zero `any`, zero `as any`, zero `@ts-ignore`, zero `eslint-disable`.
- **Check**: Use `unknown` with narrowing or Zod parsing. Fix root type contracts instead of suppressing errors.

### Gate 4: AI Testing Invariants (Iron Law)
- **Rule**: Never assert stochastic AI model prose, answer wording, Indonesian phrasing, taste, palette hues, fonts, layout structure, card counts, section sequences, or generated source snapshots in unit tests.
- **Check**: Tests assert only deterministic mechanical invariants:
  1. Zod schemas and JSON structure
  2. Required fields and type narrowing
  3. Security policies and route contracts
  4. Accessibility contrast and touch target boundaries
- **Fix**: Delete or rewrite any test that asserts exact model prose or subjective visual taste.

### Gate 5: Comment Hygiene
- **Rule**: Self-explanatory code first. Authored comments delete by default.
- **Check**: No multi-line block comments, no narrative code restatements, no ASCII banner dividers (`// ---`).
- **Fix**: Retain only strictly necessary single-line explanations for non-obvious invariants or deliberate simplifications.

### Gate 6: YAGNI & Deletion Before Addition
- **Rule**: Deletion over addition.
- **Check**: No single-use interfaces, no factories for one product, no config for static values, no dead exports or unused dependencies (`bun run check:knip`).
- **Fix**: Delete speculative code and unused abstractions.

### Gate 7: Unslop Writing Standards
- **Rule**: Follow `.agents/skills/unslop/SKILL.md` across all documentation, prompts, comments, and code identifiers.
- **Check**: Cut AI filler verbs (utilize, leverage, showcase, foster, weave), em-dashes as crutches, puffery, and passive voice. Use active, plain, concrete language.

---

## 2. Step-by-Step Execution Workflow

1. **Run automated scanners**:
   ```bash
   bun run check:discipline  # Scans for forbidden folders, 'any', multiline comments
   bun run check:knip        # Scans for dead files, unused exports, and orphan types
   bun run typecheck         # Full TypeScript compile check
   bun run lint              # ESLint check
   ```

2. **Audit touched domain against the 7 Gates**:
   - Inspect imports, types, naming, and structure.
   - Refactor in small, behavior-preserving steps.

3. **Verify full local gate**:
   ```bash
   bun run check             # Fast parallel gate
   ```

4. **Atomic Commit**:
   - Stage only task-specific files.
   - Commit with Conventional Commits taxonomy (`refactor(...)`, `fix(...)`, `docs(...)`).

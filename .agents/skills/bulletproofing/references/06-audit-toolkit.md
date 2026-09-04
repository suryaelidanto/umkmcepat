# 06 — The Audit Toolkit: Diagnostic Commands & Scorecard Template

The exact, non-negotiable diagnostic procedure for conducting an exhaustive, evidence-based codebase audit.

---

## 1. Automated Diagnostic Command Suite

Never "guess" or "sample 3 files". Run these exact commands to collect deterministic evidence across the entire codebase:

### 1. Identify Monolithic Oversized Files (> 300 LOC)
```bash
find src -type f \( -name "*.ts" -o -name "*.tsx" \) ! -name "*.gen.ts" ! -name "*.test.*" -exec wc -l {} + | sort -rn | head -30
```
*Evaluates:* Files that may violate Single Responsibility or conceal god-components.

### 2. Detect Loose Typing, `any`, and Compiler Suppressions
```bash
grep -rnE "(as any|as unknown as|@ts-ignore|eslint-disable)" src/
```
*Evaluates:* Type-safety holes where runtime errors can bypass TypeScript compilation.

### 3. Detect Inline Network Calls (Bypassing Data Layer)
```bash
grep -rnE "fetch\(" src/components/
```
*Evaluates:* Raw HTTP requests happening inside UI components rather than through the standardized Triple-Threat data layer.

### 4. Detect Dead Code, Orphan Types, and Unused Exports
```bash
bunx knip
```
*Evaluates:* Code rot, abandoned files, and zombie dependencies that bloat cognitive load.

### 5. Verify Discipline and Banned Folder Invariants
```bash
bun run check:discipline
```
*Evaluates:* Forbidden catch-all directories (`hooks/`, `utils/`, `helpers/`), ASCII banners, and multiline comments.

### 6. Verify Full Test Suite Baseline
```bash
bunx vitest run --project unit
```
*Evaluates:* Number of test files, passing assertions, and establishes the strict baseline before any refactor.

---

## 2. The 7-Pillar Evaluation Matrix

When analyzing a specific domain or the entire codebase, evaluate every pillar systematically:

| Pillar | Inspection Criteria | Red Flags (Sloppiness) |
|---|---|---|
| **1. Domain Boundaries** | Is code grouped by product feature? | Flat file sprawl in root `src/lib/`, mixing unrelated concerns in one folder. |
| **2. Unidirectional Flow** | Does code flow `shared -> domain -> route`? | Cross-feature horizontal imports, circular dependencies (`import/no-cycle`). |
| **3. Thin Route Shells** | Are routes $\le 100$ LOC? | 500-line route files containing direct forms, tables, and mutation handlers. |
| **4. State Taxonomy** | Is state placed in the right tier? | Server data copied into Zustand; URL search filters kept in local `useState`. |
| **5. Data Layer Contract** | Triple-threat pattern enforced? | Inline `fetch()`, hand-written unchecked payload interfaces, missing query invalidation. |
| **6. Resilience & Safety** | Granular error boundaries & PBAC? | Single root error boundary; missing object ownership checks on delete/update mutations. |
| **7. Test Determinism** | Colocated tests asserting contracts? | Tests in detached folders; tests asserting exact className strings or stochastic AI wording. |

---

## 3. The Audit Scorecard Template (Phase 1 Deliverable)

When Phase 1 is complete, present the findings using this exact format:

```markdown
### 🏛️ Codebase Architecture Audit Scorecard

**Target Domain:** `<domain-name-or-all>`
**Health Status:** `[Healthy | Needs Attention | High Technical Debt]`
**Baseline Tests:** `X passing test files (Y total tests)`

#### 1. Architectural Highlights (What is already solid)
- [Evidence-based positive findings]

#### 2. Architectural Findings & Code Smells
| Priority | File / Location | Observed Anti-Pattern | Root Cause & Long-Term Risk | Target Pattern |
|---|---|---|---|---|
| `CRITICAL` | `src/...` | `...` | `...` | `...` |
| `HIGH` | `src/...` | `...` | `...` | `...` |
| `MEDIUM` | `src/...` | `...` | `...` | `...` |

#### 3. Phased Surgical Refactoring Plan
- **Batch 1: [Target Name]**
  - Scope & Files to restructure:
  - Extracted hooks/sub-views:
  - Colocated tests to create:
  - Zero-regression boundary:
- **Batch 2: [Target Name]**
  - Scope & Files to restructure:
  - Extracted hooks/sub-views:
  - Colocated tests to create:

---
🛑 **THE UNBREAKABLE STOP GATE**: Audit and diagnostic complete.
No code changes have been made.
Please review the findings and approve a batch to begin execution, or request plan adjustments.
```

---

## 4. The Mandatory Stop Gate (Iron Law)

**YOU MUST STOP EXECUTION IMMEDIATELY AFTER PRINTING THE SCORECARD.**
- Do NOT proceed to Phase 2 automatically.
- Do NOT edit, delete, or move any files.
- Await the user's explicit approval or instructions on which batch to tackle.

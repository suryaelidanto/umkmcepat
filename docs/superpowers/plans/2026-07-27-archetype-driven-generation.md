# Archetype-Driven Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DESIGN UPDATE (supersedes inlined code below):** The allow-list and the guide-map are **decoupled**. `archetypes/index.ts` exports `KNOWN_ARCHETYPE_IDS: string[]` listing ALL 16 valid ids upfront (independent of authored docs), plus a backward-compat `ARCHETYPE_IDS` alias. `parseImplementationSpec` validates against `KNOWN_ARCHETYPE_IDS`. `GUIDE_BY_ID` holds only authored docs; `loadArchetypeGuide` falls back to `generic-fallback.md` for any id without a doc. **Consequence for T6:** the 15 business archetypes only ADD a `.md` import + a `GUIDE_BY_ID` entry — they must NOT reassign `KNOWN_ARCHETYPE_IDS` (all 16 ids already live there from T1). Where inlined code blocks below show `ARCHETYPE_IDS = ["generic"]` (T1) or "register each new id in `ARCHETYPE_IDS`" (T6), follow this decision note instead. T1/T2 already implemented this; T3-T6 reflect it.

**Goal:** Break template-ish generated output by auto-loading a per-business-shape archetype guidance doc into the build prompt, based on an archetype the AI names in the existing `implementationSpecTool` call.

**Architecture:** A small library of ~16 archetype `.md` guidance docs (one per *structure*, not label) + one `generic-fallback.md` written as a decision framework. The `implementationSpecTool` schema gains an `archetype` field; `parseImplementationSpec` validates the id against `KNOWN_ARCHETYPE_IDS` (unknown → `generic`). A new `archetypes/index.ts` exposes `KNOWN_ARCHETYPE_IDS`, `loadArchetypeGuide(id)`, `loadArchetypeIndex()`. The spec-call system prompt appends the index; the source-gen prompt injects the matched doc + a "justify or drop" rule. No new AI call, no classifier, no discuss/UI/DB change.

**Tech Stack:** TypeScript, Vitest, the `ai` SDK tool-calling, Bun. Markdown imported via Vite `?raw`. No new dependencies.

## Global Constraints

- Use Bun only. Run a single test file with `bunx vitest run <file>` or `bun run test -- <file>`.
- Surgical edits only — touch only what each task requires. Match surrounding style. Don't refactor adjacent code.
- Developer-facing docs/code/logs/errors use English; AI-generated UI copy stays Indonesian. The archetype `.md` prose is developer-facing guidance shown to the AI — English.
- Never bypass a failing gate. After each task run the targeted test file; before handoff run `bun run check`.
- No new dependencies. No shell on the AI agent. No `delete_file` tool.
- Pre-commit runs `bun run check:commit` (format/lint on staged only). Do not commit `.env` or build artifacts.
- Conventional Commits for every commit. Commit to `dev` (the working head branch).
- Markdown files imported with `?raw` must keep prose tight — these strings bundle into the build prompt; bloated docs cost tokens on every generate.
- `businessType` on `ProjectBrief` is a **free string** (see `src/lib/projects/brief.ts:34`), not an enum — the discuss prompt *suggests* `fnb | retail | jasa_lokal | jasa_online | kursus | other` but does not enforce them. The deterministic fallback map must match by normalized substring, not exact equality.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/lib/projects/archetypes/generic-fallback.md` | Decision-framework guidance for off-map businesses | Create |
| `src/lib/projects/archetypes/_index.md` | Compact id+description index, injected into spec call | Create |
| `src/lib/projects/archetypes/index.ts` | `ARCHETYPE_IDS`, `loadArchetypeGuide`, `loadArchetypeIndex` registry | Create |
| `src/lib/projects/archetypes/index.test.ts` | Loader wiring self-check | Create |
| `src/lib/projects/implementation-spec.ts` | Spec type/schema/parse gains `archetype`; deterministic map | Modify |
| `src/lib/projects/implementation-spec.test.ts` | Extend for `archetype` field + fallback map | Modify |
| `src/lib/projects/site-generation.ts` | Append archetype index + "justify or drop" rule | Modify |
| `src/lib/projects/custom-source-generator.ts` | Inject matched archetype doc into agent instructions | Modify |
| `src/lib/projects/archetypes/*.md` | 15 business-shape archetypes (fnb-menu, …, agri-produce) | Create (batched) |

The plumbing tasks (1-5) land first and keep the tree green with only `generic-fallback.md` authored. The 15 business archetypes are authored last (task 6), in batches, so each batch is independently committable and the tree stays green between them.

---

## Task 1: Archetype loader + generic-fallback doc (plumbing foundation)

**Files:**
- Create: `src/lib/projects/archetypes/generic-fallback.md`
- Create: `src/lib/projects/archetypes/_index.md`
- Create: `src/lib/projects/archetypes/index.ts`
- Test: `src/lib/projects/archetypes/index.test.ts`

**Interfaces:**
- Produces (consumed by tasks 2, 3, 4):
  - `ARCHETYPE_IDS: string[]` — registry of valid archetype ids. Must always include `"generic"`.
  - `loadArchetypeGuide(id: string): string` — returns the `.md` content for `id`; unknown/`"generic"`/empty → contents of `generic-fallback.md`. Never throws, never returns empty.
  - `loadArchetypeIndex(): string` — returns `_index.md` content (non-empty).

- [ ] **Step 1: Write the failing test**

Create `src/lib/projects/archetypes/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  ARCHETYPE_IDS,
  loadArchetypeGuide,
  loadArchetypeIndex,
} from "./index";

describe("archetype loader", () => {
  it("always exposes a generic fallback id", () => {
    expect(ARCHETYPE_IDS).toContain("generic");
  });

  it("loadArchetypeIndex returns non-empty text", () => {
    expect(loadArchetypeIndex().trim().length).toBeGreaterThan(0);
  });

  it("resolves every registered id to a non-empty doc", () => {
    for (const id of ARCHETYPE_IDS) {
      expect(loadArchetypeGuide(id).trim().length).toBeGreaterThan(0);
    }
  });

  it("falls back to generic for unknown ids", () => {
    const fallback = loadArchetypeGuide("generic");
    const unknown = loadArchetypeGuide("this-archetype-does-not-exist");
    expect(unknown).toBe(fallback);
  });

  it("falls back to generic for empty input", () => {
    expect(loadArchetypeGuide("")).toBe(loadArchetypeGuide("generic"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/projects/archetypes/index.test.ts`
Expected: FAIL — module `./index` not found.

- [ ] **Step 3: Write the generic-fallback doc**

Create `src/lib/projects/archetypes/generic-fallback.md`. This is a decision framework, NOT a template. Keep prose tight (it bundles into the build prompt).

````markdown
# Archetype: generic (fallback — no shape matched)

Use this when no business-shape archetype fits. It is a decision framework, not a mini-template. Reasoning from first principles beats reaching for a safe skeleton.

## Decision steps

1. **Goal.** Read the brief and decide the single primary goal: sell | inform | book | persuade. One goal wins; the rest support it.
2. **Breadth.** Use the `appKind` already chosen in the spec:
   - `landing` — one page. Only split into pages if a second page has a distinct purpose nothing on the home page can serve.
   - `marketing_site` — 2-3 pages. Each extra page must answer "why can't this be a section on home?" — no answer = no page.
   - `interactive_app` — static frontend interaction (filter, calculator, booking-intent form, catalog). No backend persistence.
3. **Page count.** Justify each page against the goal. A justified absence beats a generic presence.
4. **Sections.** Justify each section against the goal. If you cannot say why this section serves the goal for THIS business, drop it or replace it with one that does.
5. **CTA.** Pick the CTA by goal, not by default. "Hubungi Kami" is banned unless contact is genuinely the goal. A booking goal → "Pilih jadwal"; a catalog goal → "Lihat katalog"; a sale goal → the actual buy action.
6. **Visual direction.** Derive visual metaphors from business specifics (product, place, process), not from a generic palette. A bakery is not a gradient hero; a freelance service is not a testimonial carousel.

## Forbidden default skeleton

Do NOT emit Hero → Fitur → Testimoni → Kontak unless every section is justified above. Default to dropping or replacing unjustified sections.

## Examples (non-UMKM, to widen the shape space)

- A community announcement page: one page, date + lineup + location, CTA = "Daftar/RSVP".
- A personal portfolio: one page, selected-works grid + short bio, CTA = "Hubungi untuk kolaborasi".
- A one-off event: one page, countdown + speakers + location, CTA = "Beli tiket".
````

- [ ] **Step 4: Write the index doc**

Create `src/lib/projects/archetypes/_index.md`. The spec-call prompt appends this verbatim, so it must be compact. Include only `id — one-line description` lines. `generic` is always last.

```markdown
# Archetype index

Pick the ONE archetype that best fits the business shape (structure, not label). Emit its id in the `archetype` field of the implementation spec. If none fits, use `generic`.

- fnb-menu — warung makan / cafe / restoran: menu board, daily special, hours
- fnb-light — kue / snack / catering: product showcase, order, pickup/delivery
- retail-catalog — fashion / craft / sparepart: product grid, price, cards
- retail-grocery — toko kelontong / sembako: essentials, hours, location
- service-area — plumber / cleaning / salon / laundry: coverage area, service list, booking-intent
- service-appointment — barbershop / klinik / studio: slots, staff, booking
- service-online — freelance / desain / tulisan: packages, portfolio, contact
- education-course — kursus / bimbel / workshop: curriculum, schedule, enroll
- professional-credibility — konsultan / notaris / arsitek: credentials, trust, services
- community-group — komunitas / paguyuban / arisan: membership, events, join
- event-promo — bazaar / pop-up / event: date, lineup, location
- property-rental — kos / sewa properti: units, price, location
- health-beauty — klinik kecantikan / spa: services, packages, booking
- creative-portfolio — desainer / fotografer / musisi: gallery, works
- agri-produce — petani / organik: products, origin, order
- generic — no shape matched: decision-framework fallback
```

- [ ] **Step 5: Write the loader**

Create `src/lib/projects/archetypes/index.ts`. Each `.md` is imported via `?raw` (Vite inlines the string at build time; no runtime filesystem read). `ARCHETYPE_IDS` is an explicit array — do NOT scan the directory.

```ts
import genericFallback from "./generic-fallback.md?raw";
import indexDoc from "./_index.md?raw";

export const ARCHETYPE_IDS: string[] = ["generic"];

const GUIDE_BY_ID: Record<string, string> = {
  generic: genericFallback,
};

const INDEX_DOC: string = indexDoc;

export function loadArchetypeGuide(id: string): string {
  const normalized = typeof id === "string" ? id.trim().toLowerCase() : "";
  return GUIDE_BY_ID[normalized] ?? genericFallback;
}

export function loadArchetypeIndex(): string {
  return INDEX_DOC;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bunx vitest run src/lib/projects/archetypes/index.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/archetypes/
git commit -m "feat(archetype-generation): add archetype loader and generic fallback doc

Plumbing foundation for archetype-driven generation: ARCHETYPE_IDS registry,
loadArchetypeGuide (unknown→generic), loadArchetypeIndex. Only generic-fallback
authored so far; business archetypes land in a later task."
```

---

## Task 2: Add `archetype` to the implementation spec type, schema, and parser

**Files:**
- Modify: `src/lib/projects/implementation-spec.ts` (type `ImplementationSpec` ~line 45; `implementationSpecTool.inputSchema` ~line 10; `parseImplementationSpec` ~line 60-130)
- Test: `src/lib/projects/implementation-spec.test.ts`

**Interfaces:**
- Consumes: `loadArchetypeGuide`, `ARCHETYPE_IDS` from task 1 (used to normalize unknown ids to `"generic"`).
- Produces: `ImplementationSpec.archetype: string` — always a valid id; the parser guarantees it is `"generic"` when absent/unknown.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/projects/implementation-spec.test.ts` (inside the existing `describe("implementation spec", ...)` block):

```ts
it("accepts and preserves an archetype id", () => {
  const spec = parseImplementationSpec({
    appKind: "landing",
    businessName: "Warung Bu Ani",
    pages: [
      { slug: "/", title: "Warung Bu Ani", purpose: "Menu harian." },
    ],
    components: [
      { name: "MenuBoard", purpose: "Daftar menu harian." },
      { name: "Hours", purpose: "Jam buka." },
    ],
    features: ["daily_menu", "hours"],
    content: { offer: "Makanan rumahan", audience: "warga sekitar" },
    style: {
      direction: "Hangat, rumahan.",
      palette: {
        background: "#fffbeb",
        foreground: "#1c1917",
        muted: "#a8a29e",
        accent: "#d97706",
      },
    },
    primaryCta: "Lihat menu",
    notes: [],
    archetype: "fnb-menu",
  });

  expect(spec?.archetype).toBe("fnb-menu");
});

it("falls back to generic for unknown or missing archetype", () => {
  const base = {
    appKind: "landing",
    businessName: "Usaha Bebas",
    pages: [{ slug: "/", title: "Usaha Bebas", purpose: "Perkenalan." }],
    components: [
      { name: "Hero", purpose: "Perkenalan." },
      { name: "Contact", purpose: "Kontak." },
    ],
    features: ["intro"],
    content: { offer: "Layanan", audience: "umum" },
    style: {
      direction: "Bersih.",
      palette: {
        background: "#ffffff",
        foreground: "#111111",
        muted: "#6b7280",
        accent: "#16a34a",
      },
    },
    primaryCta: "Hubungi",
    notes: [],
  } as const;

  expect(parseImplementationSpec({ ...base, archetype: "no-such-shape" })?.archetype).toBe(
    "generic",
  );
  expect(parseImplementationSpec(base)?.archetype).toBe("generic");
});
```

Also extend the existing "accepts AI-decided interactive app structure" test (first test in the block) — add `archetype: "service-appointment"` to its input object and assert `spec?.archetype` equals `"service-appointment"`. (The existing `ARCHETYPE_IDS` from task 1 only contains `"generic"` at this point; these tests must still pass because the parser normalizes any unknown id to `"generic"`. So for the first-test extension, use `archetype: "generic"` instead, and assert `spec?.archetype` is `"generic"`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/lib/projects/implementation-spec.test.ts`
Expected: FAIL — `archetype` is `undefined` (type/schema/parser don't know it yet).

- [ ] **Step 3: Add `archetype` to the tool input schema**

In `src/lib/projects/implementation-spec.ts`, inside `implementationSpecTool.inputSchema` (the `z.object({...})`), add a field after `appKind`:

```ts
    archetype: z
      .string()
      .describe(
        "The archetype id that best fits this business shape. Pick from the archetype index. Use 'generic' if none fits.",
      ),
```

- [ ] **Step 4: Add `archetype` to the `ImplementationSpec` type**

In the same file, in the `export type ImplementationSpec = { ... }` block, add after `appKind`:

```ts
  archetype: string;
```

- [ ] **Step 5: Normalize `archetype` in `parseImplementationSpec`**

In `parseImplementationSpec`, after the existing local consts (near where `appKind` is computed, ~line 73), add:

```ts
  const archetype = ARCHETYPE_IDS.includes(
    typeof data.archetype === "string" ? data.archetype.trim().toLowerCase() : "",
  )
    ? (data.archetype as string).trim().toLowerCase()
    : "generic";
```

Add the import at the top of the file:

```ts
import { ARCHETYPE_IDS } from "@/lib/projects/archetypes";
```

Then include `archetype` in the returned object (the `return { appKind, businessName, pages, ... }` near line 118):

```ts
    archetype,
```

Note: `archetype` must NOT be added to the strict-validation `if (...)` block — an unknown/missing archetype is valid (it normalizes to `"generic"`), so it must never reject the spec. Add it only to the returned object.

- [ ] **Step 6: Run tests to verify they pass**

Run: `bunx vitest run src/lib/projects/implementation-spec.test.ts`
Expected: PASS (all tests, including the new ones and the extended first test).

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/implementation-spec.ts src/lib/projects/implementation-spec.test.ts
git commit -m "feat(archetype-generation): add archetype field to implementation spec

Tool schema + type + parser carry an archetype id. parseImplementationSpec
normalizes unknown/missing ids to 'generic' without rejecting the spec."
```

---

## Task 3: Deterministic `archetype` from brief (safety net)

**Files:**
- Modify: `src/lib/projects/implementation-spec.ts` (`implementationSpecFromBrief` ~line 202-292)
- Test: `src/lib/projects/implementation-spec.test.ts`

**Interfaces:**
- Consumes: `brief.businessType` (free string, see Global Constraints).
- Produces: a deterministic `archetype` on the fallback spec, so even the non-AI path (a brief that skips the spec call) carries a sensible shape.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/projects/implementation-spec.test.ts`:

```ts
it("implementationSpecFromBrief maps businessType to a shape archetype", () => {
  const cases: Array<[string, string]> = [
    ["warung makan (fnb)", "fnb-menu"],
    ["Thrift kaos (retail)", "retail-catalog"],
    ["Laundry jasa_lokal", "service-area"],
    ["Desain grafis jasa_online", "service-online"],
    ["Bimbel kursus", "education-course"],
    ["something uncategorizable", "generic"],
  ];

  for (const [businessType, expected] of cases) {
    const brief = parseProjectBrief(
      {
        readyForBuild: true,
        confidence: 95,
        businessName: "Usaha Contoh",
        businessType,
        offer: "Layanan contoh",
        productOrService: [{ name: "Contoh", isPrimary: true }],
        contactOrCta: "Chat WA",
      },
      "buat web",
    );
    const spec = implementationSpecFromBrief(brief);
    expect(parseImplementationSpec(spec)?.archetype).toBe(expected);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/projects/implementation-spec.test.ts`
Expected: FAIL — `archetype` is `"generic"` for all cases (the deterministic map doesn't exist yet).

- [ ] **Step 3: Add the deterministic map and use it**

In `src/lib/projects/implementation-spec.ts`, add a helper near the top (after imports, before `implementationSpecTool`):

```ts
/**
 * Best-effort shape guess from a free-text businessType.
 * Keys on normalized substring; order matters (first match wins).
 * `ponytail:` only a safety net — the AI spec call is the real selector.
 */
function archetypeFromBusinessType(businessType: string): string {
  const text = businessType.toLowerCase();
  const rules: Array<[string, string]> = [
    ["fnb", "fnb-menu"],
    ["warung makan", "fnb-menu"],
    ["restoran", "fnb-menu"],
    ["cafe", "fnb-menu"],
    ["kue", "fnb-light"],
    ["snack", "fnb-light"],
    ["catering", "fnb-light"],
    ["retail", "retail-catalog"],
    ["fashion", "retail-catalog"],
    ["thrift", "retail-catalog"],
    ["kelontong", "retail-grocery"],
    ["sembako", "retail-grocery"],
    ["jasa_lokal", "service-area"],
    ["laundry", "service-area"],
    ["barber", "service-appointment"],
    ["klinik", "service-appointment"],
    ["jasa_online", "service-online"],
    ["freelance", "service-online"],
    ["desain", "service-online"],
    ["kursus", "education-course"],
    ["bimbel", "education-course"],
  ];
  for (const [needle, id] of rules) {
    if (text.includes(needle)) {
      return id;
    }
  }
  return "generic";
}
```

In `implementationSpecFromBrief`, compute and include the archetype. After the existing `const palette = { ... }` block (~line 235), add:

```ts
  const archetype = archetypeFromBusinessType(
    clean(brief.businessType, 80) || "",
  );
```

Then add `archetype,` to the returned object in `implementationSpecFromBrief` (the `return { appKind: "landing", businessName, pages, ... }` block ~line 278).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/lib/projects/implementation-spec.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/implementation-spec.ts src/lib/projects/implementation-spec.test.ts
git commit -m "feat(archetype-generation): map brief businessType to archetype deterministically

Safety net for the non-AI fallback spec path. Substring match on free-text
businessType; first match wins; unknown → generic."
```

---

## Task 4: Inject archetype index + "justify or drop" rule into the spec-call system prompt

**Files:**
- Modify: `src/lib/projects/site-generation.ts`

**Interfaces:**
- Consumes: `loadArchetypeIndex()` from task 1.
- Produces: a system prompt that tells the AI to pick an archetype and forbids the default skeleton unless justified.

- [ ] **Step 1: Read the current file**

Run: `cat src/lib/projects/site-generation.ts`
Confirm the full content is the single exported `projectSiteGenerationSystemPrompt` template string.

- [ ] **Step 2: Write the change**

Replace the entire file with:

```ts
import { loadArchetypeIndex } from "@/lib/projects/archetypes";

const archetypeIndex = loadArchetypeIndex();

export const projectSiteGenerationSystemPrompt = `Decide the right generated app structure for an Indonesian small-business project.
Do not force every request into a landing page.
Choose appKind:
- landing: simple one-page marketing/contact site.
- marketing_site: richer content with multiple pages/sections.
- interactive_app: static frontend interaction such as filters, calculators, booking-intent forms, catalogs, or guided flows. No backend persistence.
Use concrete details from the conversation.
Do not ask questions.
Do not mention AI.
Do not invent phone numbers, exact addresses, certifications, awards, prices, guarantees, stock, payment status, or persistence.
Only include a CTA if it is relevant to the user's need.
Write Indonesian customer-facing content.
Prefer specific structure, pages, components, and features over generic landing-page sections.

${archetypeIndex}

Also set the \`archetype\` field to the ONE id that best fits this business shape, from the index above. If none fits, use \`generic\`.

FORBIDDEN DEFAULT SKELETON:
Do NOT emit the default skeleton (Hero → Fitur → Testimoni → Kontak) unless every section is justified by the matched archetype's guidance. If you cannot justify a section against THIS business, drop it or replace it with a section the archetype recommends. A justified absence beats a generic presence.`;
```

- [ ] **Step 3: Verify typecheck + the existing site-generation wiring still resolves**

Run: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "site-generation|archetypes/index" | head` (expect no hits; a clean grep = no errors in these files).
Also confirm the prompt still imports cleanly by running the targeted test:

Run: `bunx vitest run src/lib/projects/implementation-spec.test.ts src/lib/projects/archetypes/index.test.ts`
Expected: PASS (no behavior change to these tests; just confirms the import graph is intact).

- [ ] **Step 4: Commit**

```bash
git add src/lib/projects/site-generation.ts
git commit -m "feat(archetype-generation): inject archetype index and forbid default skeleton in spec prompt

The spec-call system prompt now carries the archetype index (so the AI picks an
id) and a negative constraint: Hero→Fitur→Testimoni→Kontak is forbidden unless
each section is justified by the matched archetype."
```

---

## Task 5: Inject the matched archetype doc into the source-gen agent instructions

**Files:**
- Modify: `src/lib/projects/custom-source-generator.ts` (`buildGeneratedAppAgentInstructions` ~line 2096; import block ~line 24)

**Interfaces:**
- Consumes: `loadArchetypeGuide(spec.archetype)` from task 1; `implementationSpec.archetype` from task 2.
- Produces: an "ARCHETYPE GUIDANCE" block in the agent instructions, placed before the "Build intent" block, so the shape logic frames the build.

- [ ] **Step 1: Add the import**

In `src/lib/projects/custom-source-generator.ts`, add to the import block near line 24:

```ts
import { loadArchetypeGuide } from "@/lib/projects/archetypes";
```

- [ ] **Step 2: Inject the guidance block into `buildGeneratedAppAgentInstructions`**

In `buildGeneratedAppAgentInstructions` (~line 2096), the returned template string currently interpolates `Business: ${...}` near the top. Insert a new block immediately after that `Business:` line and before `${skillsBlock}`. Replace the line:

```ts
Business: ${implementationSpec?.businessName || schema.businessName} — ${implementationSpec?.appKind || "landing"} — ${(implementationSpec?.features || [schema.offer, schema.audience]).join(", ")}
${skillsBlock}
```

with:

```ts
Business: ${implementationSpec?.businessName || schema.businessName} — ${implementationSpec?.appKind || "landing"} — ${(implementationSpec?.features || [schema.offer, schema.audience]).join(", ")}

ARCHETYPE GUIDANCE (follow this shape; it overrides any default skeleton):
${loadArchetypeGuide(implementationSpec?.archetype ?? "")}
${skillsBlock}
```

The `?? ""` ensures a spec with no `archetype` (legacy snapshots without the field) falls back to the `generic-fallback.md` doc via `loadArchetypeGuide`.

- [ ] **Step 3: Verify typecheck + the source-generator tests still pass**

Run: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "custom-source-generator" | head` (expect no hits).
Run: `bunx vitest run src/lib/projects/custom-source-generator.test.ts`
Expected: PASS (the injected block is prompt text; existing assertions about the brief/prompt content should still hold — if any existing test asserts an exact substring that now moves because of the inserted block, update that assertion to match the new shape, and note it in the commit).

- [ ] **Step 4: Run the full focused gate**

Run: `bun run check`
Expected: PASS (format, lint, typecheck, affected tests, Knip). This is the manual fast gate per CLAUDE.md.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/custom-source-generator.ts
git commit -m "feat(archetype-generation): inject matched archetype doc into source-gen prompt

buildGeneratedAppAgentInstructions now prepends an ARCHETYPE GUIDANCE block
(loaded via loadArchetypeGuide from spec.archetype, falling back to generic)
before the skills/build-intent blocks. Legacy specs without an archetype field
fall back to the generic decision framework."
```

---

## Task 6: Author the 15 business-shape archetypes (batched)

**Files:**
- Create (in `src/lib/projects/archetypes/`): `fnb-menu.md`, `fnb-light.md`, `retail-catalog.md`, `retail-grocery.md`, `service-area.md`, `service-appointment.md`, `service-online.md`, `education-course.md`, `professional-credibility.md`, `community-group.md`, `event-promo.md`, `property-rental.md`, `health-beauty.md`, `creative-portfolio.md`, `agri-produce.md`
- Modify: `src/lib/projects/archetypes/index.ts` (register each new doc in `GUIDE_BY_ID` only — `KNOWN_ARCHETYPE_IDS` already lists all 16 ids from T1, do NOT reassign it)
- Modify: `src/lib/projects/archetypes/_index.md` (already lists all 15 + generic; no change needed unless a name was adjusted during authoring)

**Interfaces:**
- Consumes: the fixed 8-section structure from the spec (`id`, `matches`, `recommended_sections`, `avoid_sections`, `page_count`, `cta_logic`, `visual_hooks`, `example_structure`).
- Produces: 15 guidance docs + their loader registration. After this task, `ARCHETYPE_IDS` contains all 16 ids and the loader resolves each.

**Authoring rules (apply to every doc):**
- Each `.md` MUST start with `# Archetype: <id> (<short label>)`.
- Then the 8 sections in order, as `##` headings.
- `recommended_sections`: 3-6 named sections, each with a one-sentence *why*.
- `avoid_sections`: 2-4 sections the AI reaches for by default that do NOT fit, each with a one-sentence reason.
- `page_count`: a short rule keyed to `appKind`.
- `cta_logic`: primary CTA for this shape + when `secondaryCta` applies.
- `visual_hooks`: 2-3 business-specific visual metaphors (not a fixed palette).
- `example_structure`: one concrete section sequence; explicit that departure is encouraged when justified.
- Keep total length ≤ ~60 lines per doc (it bundles into the build prompt).

This task is split into 3 sub-batches so each is independently committable and the tree stays green. Run the loader test after each batch.

### Task 6a: FNB + retail archetypes (5 docs)

- [ ] **Step 1: Author the 5 docs**

Create `fnb-menu.md`, `fnb-light.md`, `retail-catalog.md`, `retail-grocery.md` following the authoring rules. Example for `fnb-menu.md`:

````markdown
# Archetype: fnb-menu (warung makan / F&B with a menu)

## matches
- warung makan, cafe, restoran, kedai makan
- any F&B whose core product is a changing menu of dishes

## recommended_sections
- Menu board — the menu IS the product; a daily-changing list is the headline, not a side feature.
- Today's special / unggulan — surfacing one or two signature dishes drives the decision.
- Hours + location — eat-now customers need both before walking in.
- Order / contact CTA — WhatsApp or in-person direction.

## avoid_sections
- Generic 3-feature grid — "Cepat, Murah, Berkualitas" says nothing about the food.
- Testimoni carousel — avoid unless real customer quotes exist; a warung earns trust from the menu + hours, not fabricated praise.

## page_count
- landing: one page. Split into a separate menu page only if the menu has 20+ items across distinct categories.

## cta_logic
- Primary: "Lihat menu" or "Pesan via WA". Secondary: reserve-a-table CTA only if booking is a real bottleneck.

## visual_hooks
- Food-forward imagery: a dish photo or a hand-drawn menu card, not an abstract gradient hero.
- Price legible next to each item.
- Warm, appetite-appropriate palette, not a corporate blue.

## example_structure
Header (name + hours) → Menu board (grouped by category) → Today's special → Location/map → Order CTA. Depart when justified — e.g. a catering warung may swap the menu board for a package list.
````

Author the other 4 (`fnb-light.md`, `retail-catalog.md`, `retail-grocery.md`) with the same 8-section structure, shape-specific content (e.g. `retail-catalog` → product grid + price legible + card; `retail-grocery` → essentials list + hours + location; `fnb-light` → product showcase + pickup/delivery + order CTA).

- [ ] **Step 2: Register them in the loader**

In `src/lib/projects/archetypes/index.ts`:

Add imports at the top (after the existing `genericFallback`/`indexDoc` imports):

```ts
import fnbMenu from "./fnb-menu.md?raw";
import fnbLight from "./fnb-light.md?raw";
import retailCatalog from "./retail-catalog.md?raw";
import retailGrocery from "./retail-grocery.md?raw";
```

Update `ARCHETYPE_IDS`:

```ts
export const ARCHETYPE_IDS: string[] = [
  "fnb-menu",
  "fnb-light",
  "retail-catalog",
  "retail-grocery",
  "generic",
];
```

Update `GUIDE_BY_ID`:

```ts
const GUIDE_BY_ID: Record<string, string> = {
  generic: genericFallback,
  "fnb-menu": fnbMenu,
  "fnb-light": fnbLight,
  "retail-catalog": retailCatalog,
  "retail-grocery": retailGrocery,
};
```

- [ ] **Step 3: Run the loader test**

Run: `bunx vitest run src/lib/projects/archetypes/index.test.ts`
Expected: PASS (the "resolves every registered id to a non-empty doc" test now covers 5 ids).

- [ ] **Step 4: Commit**

```bash
git add src/lib/projects/archetypes/
git commit -m "feat(archetype-generation): author fnb + retail archetypes

4 business-shape guidance docs (fnb-menu, fnb-light, retail-catalog,
retail-grocery) following the fixed 8-section structure; registered in the loader."
```

### Task 6b: Service + education archetypes (5 docs)

- [ ] **Step 1: Author and register 5 docs**

Create `service-area.md`, `service-appointment.md`, `service-online.md`, `education-course.md`, `professional-credibility.md` following the authoring rules. Shape-specific guidance:
- `service-area` → coverage area map + service list + booking-intent; avoid generic testimonials.
- `service-appointment` → slots/staff + booking; CTA = "Pilih jadwal".
- `service-online` → packages + portfolio + contact; avoid address/hours; avoid testimonial carousel unless real quotes.
- `education-course` → curriculum + schedule + enroll; CTA = "Daftar".
- `professional-credibility` → credentials + trust signals + services; avoid fabricated guarantees.

Register in `src/lib/projects/archetypes/index.ts` (imports + `ARCHETYPE_IDS` + `GUIDE_BY_ID`), same pattern as 6a.

- [ ] **Step 2: Run the loader test**

Run: `bunx vitest run src/lib/projects/archetypes/index.test.ts`
Expected: PASS (9 ids now).

- [ ] **Step 3: Commit**

```bash
git add src/lib/projects/archetypes/
git commit -m "feat(archetype-generation): author service + education archetypes

5 guidance docs (service-area, service-appointment, service-online,
education-course, professional-credibility); registered in the loader."
```

### Task 6c: Remaining 6 archetypes

- [ ] **Step 1: Author and register 6 docs**

Create `community-group.md`, `event-promo.md`, `property-rental.md`, `health-beauty.md`, `creative-portfolio.md`, `agri-produce.md` following the authoring rules. Shape-specific guidance:
- `community-group` → membership + events + join; CTA = "Gabung".
- `event-promo` → date + lineup + location; CTA = "Daftar/Beli tiket".
- `property-rental` → units + price + location; CTA = "Tanya ketersediaan".
- `health-beauty` → services + packages + booking; CTA = "Booking".
- `creative-portfolio` → gallery + selected works; avoid fabricated client logos.
- `agri-produce` → products + origin + order; CTA = "Pesan".

Register in `src/lib/projects/archetypes/index.ts` (imports + `ARCHETYPE_IDS` + `GUIDE_BY_ID`), same pattern. After this batch `ARCHETYPE_IDS` contains all 16 ids.

- [ ] **Step 2: Run the loader test + verify the index doc matches**

Run: `bunx vitest run src/lib/projects/archetypes/index.test.ts`
Expected: PASS (16 ids).
Also confirm `_index.md` lists exactly the 16 ids in `ARCHETYPE_IDS` (it already does from task 1; if a name was adjusted during authoring, update `_index.md` to match).

- [ ] **Step 3: Commit**

```bash
git add src/lib/projects/archetypes/
git commit -m "feat(archetype-generation): author community/event/property/health/creative/agri archetypes

6 guidance docs (community-group, event-promo, property-rental, health-beauty,
creative-portfolio, agri-produce). All 16 archetypes now authored and registered."
```

---

## Task 7: Final verification + docs sync

**Files:**
- Modify: `docs/architecture.md` (add a one-paragraph note under the existing "Project workspace" / generation flow, since the generation prompt behavior changed)

**Interfaces:** None (verification + docs).

- [ ] **Step 1: Run the full local gate**

Run: `bun run check`
Expected: PASS (format, lint, typecheck, affected tests, Knip).

- [ ] **Step 2: Run the full test suite (focused, not CI build)**

Run: `bun run test`
Expected: PASS (or only pre-existing unrelated failures — note any).

- [ ] **Step 3: Update the architecture doc**

In `docs/architecture.md`, under the section that describes the generation flow (the bullet beginning "Build generation asks AI for a schema-validated flexible implementation spec before writing source…"), append one sentence so the canonical doc records the new divergence mechanism:

> The spec also carries an `archetype` id; the build prompt loads the matching guidance doc from `src/lib/projects/archetypes/` to break the default section skeleton per business shape, with a generic decision-framework fallback for off-map businesses.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture.md
git commit -m "docs(architecture): record archetype-driven generation divergence mechanism

The implementation spec now carries an archetype id; the build prompt loads a
per-shape guidance doc to break the default skeleton, with a generic fallback."
```

- [ ] **Step 5: (No behavioral E2E) eyeball verification — manual, not automated**

Per the spec, divergence quality is verified by generating 2-3 projects across different archetypes (e.g. a warung → `fnb-menu`, a plumber → `service-area`, a freelance designer → `service-online`) and confirming the generated structure differs, not by an automated assertion. This is a manual sanity check by the human reviewer after merge, not a CI step. Do not add a test for "is not template-ish" — that is not an assertable predicate.

# Generation Speed (Full shadcn Seed + Shared node_modules + Loop Detector) — Design

**Date:** 2026-07-22
**Status:** Approved (brainstormed 2026-07-22)
**Relationship to other plans:** This is a **prerequisite** speed phase. The paused Stage B plan (`docs/superpowers/plans/2026-07-22-guard-and-runtime-self-heal.md`, spec `docs/superpowers/specs/2026-07-22-guard-and-runtime-self-heal-design.md`) resumes **after** this ships. They compose: both are verify-and-recover loops over the same generation/build seam.

## Problem

Generated-project builds take 10+ minutes and sometimes produce no output (the `601s` stale-build case). Three causes, confirmed by audit + web research:

1. **Build-time `bun install` runs per new project** (~30-60s for React 19 + TanStack + Tailwind v4 + shadcn/Radix + Vite + TS). The stable-workspace-key fix (prior plan Task 1) skips install on *repeat* builds of the *same* project, but the **first build of every new project still installs from scratch.** Every generated project has an identical, locked, platform-owned `package.json` — so a shared pre-installed `node_modules` can serve them all.
2. **The agent thrashes** — re-reads the same files, loops on the same tool calls, burning the step budget producing nothing (the 601s-no-output case). Research (`dev.to/alanwest/how-to-fix-tool-use-loops...`) pins this on stateless decision-making: the agent's working state looks identical at step N and N+5, so it repeats.
3. **Slow model per-step** (DeepSeek V4-Pro's ~120s thinking tax before each tool call). User-managed (combo config in 9Router); out of this spec's scope except that fewer steps + killed thrash make the slow model tolerable.

## Goal

Get generated-project builds to **1-3 minutes total** that actually finish, by:
- Pre-seeding the full shadcn component set so the AI picks + imports (no build-time network/CLI).
- Sharing a read-only pre-installed `node_modules` so first builds skip `bun install`.
- Detecting + breaking tool-call loops so the agent stops thrashing, plus per-step timing for visibility.

Plus the already-applied lever: `AI_AGENT_GENERATE_MAX_STEPS="12"` (50→12) — the step-count cut that's the single biggest AI-side speedup. Not part of this spec's code; it's an env default documented here for completeness.

## Scope

**In scope:**
- Section 1 — full shadcn component set pre-seeded into the scaffold + dep allowlist/golden `package.json` expansion.
- Section 2 — shared golden `node_modules` (lazy provisioning, read-only symlink, cross-OS junction fallback, fall-back-to-install).
- Section 3 — loop detector (exact-repeat, nudge@3, hard-cap@5) + per-step timing/tracing.

**Out of scope (deferred):**
- Diversity-over-window loop detection (only if data shows alternating-loop patterns the exact-repeat check misses).
- A `shadcn-add` CLI tool — rejected; pre-seed replaces it (keeps the no-shell boundary).
- Container-isolated builds / OS bind-mounts (Stage C, when builds are containerized).
- The Stage B runtime self-heal — resumes after this ships (separate plan, unchanged).

## Architecture

### Section 1 — Full shadcn component set pre-seeded

The scaffold ships every shadcn component ("new-york" + Tailwind v4 style) as local `.tsx` files in `src/components/ui/`. The AI picks + imports; no CLI, no build-time network.

**Provisioning (one-time, then committed — never at project-build-time):**
- A fetch script (run once by a maintainer, not by the build) pulls each component's canonical source from the shadcn registry (stable JSON endpoints, MIT-licensed) for the "new-york" + Tailwind v4 variant. ~40 components: `button`, `card`, `dialog`, `accordion`, `tabs`, `dropdown-menu`, `tooltip`, `toast`/`sonner`, `table`, `form`, `select`, `checkbox`, `radio-group`, `command`, `calendar`, `carousel`, `resizable`, `drawer` (`vaul`), `aspect-ratio`, `menubar`, `navigation-menu`, `popover`, `hover-card`, `progress`, `scroll-area`, `avatar`, `switch`, `slider`, `context-menu`, `collapsible`, `input-otp`, `sidebar`, `breadcrumb`, `chart`, `label`, `separator`, `badge`, `input`, `textarea`, `sheet`, `toggle`, `toggle-group`, `pagination`, `skeleton`, `alert`, `alert-dialog`, etc.
- Written into the existing `src/lib/projects/scaffold/shadcn-components.ts` (expanded from the current 6-component seed) and committed to the repo.
- After commit, components are local source — zero network, zero CLI, ever, at project-build-time.

**Dep expansion (required, mechanical):**
- The package allowlist (`src/lib/projects/generated-package-policy.ts`, `vite-react-tanstack-v1` set) gains every dependency the full set imports: `@radix-ui/react-{dialog,accordion,tabs,dropdown-menu,tooltip,popover,hover-card,select,checkbox,radio-group,switch,slider,scroll-area,avatar,progress,menubar,navigation-menu,collapsible,aspect-ratio,context-menu,form,label,separator,slot,toast,...}`, `cmdk` (command), `react-day-picker` (calendar), `react-resizable-panels` (resizable), `embla-carousel-react` (carousel), `input-otp`, `sonner`, `vaul` (drawer), `next-themes` (theme toggle), and any others the fetched sources import. All allowlisted + locked with semver specifiers.
- The scaffold's `package.json` (`src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts`) + the golden dep set (Section 2) include the same expanded deps.
- `shadcn-ui.md` skill updates: "the full set is pre-seeded in `src/components/ui/*`; pick any — do not run a CLI."

**Tree-shaking:** Vite purges unused seeded components from each project's final bundle. Seeding ~40 components costs source-tree disk (a few hundred KB of `.tsx`), not runtime bundle size.

**Security boundary preserved:** components are local source the AI imports — no shell, no network at build, no CLI. The AI can't install anything; deps are allowlist-gated; `package.json` is platform-owned. Same boundary as today, bigger seed.

### Section 2 — Shared golden `node_modules`

Every project's first build symlinks a pre-installed read-only `node_modules` instead of running `bun install`. First-build install (~30-60s) → ~1s symlink.

**Provisioning (platform, lazy, never user/AI):**
- The golden `node_modules` lives at a fixed shared path: `.data/project-build-workspaces/_shared/node_modules` (per-machine, gitignored — never committed, since `node_modules` isn't portable across machines/architectures).
- Provisioned lazily on the **first build**: a helper checks if the golden exists + its dependency signature matches the locked dep set (which changes only when the scaffold deps change — e.g. Section 1's full-shadcn seed triggers exactly one golden re-install). If missing/stale, runs `bun install --ignore-scripts` **once** into the shared path, guarded by the signature. After that, all projects reuse it.

**Per-project use (symlink):**
- `attemptBuild`'s file-sync step creates a `node_modules` **symlink** in the workspace pointing at the golden path, *before* the `shouldInstall` check.
- The existing `shouldInstall` gate (`src/lib/projects/generated-source.ts:322`) checks `pathExists(node_modules)` → now true → **install skipped, gate logic untouched.**
- Build proceeds (`tsc -b && vite build`) reading deps through the symlink.

**Read-only / isolation (architecture.md:65 — one bad project must not break another):**
- The golden `node_modules` is **read-only** to the build (the build only reads deps; it can't write to the symlink target). A buggy/malicious generated project can't corrupt the shared tree for others.
- If the golden is missing/corrupt, **fall back to `bun install`** (the existing path) — a broken golden never blocks a build.

**Cross-OS portability (locked — contributors on Windows/macOS/Linux):**
- `fs.symlink` for directories. On **Windows**, directory symlinks need developer-mode/admin — so use a **junction fallback** (`fs.symlink(target, link, 'junction')`-equivalent — junctions work without admin/dev-mode, the Windows-native privilege-free directory link). On **macOS/Linux**, native symlinks (no privilege needed).
- **Layered fallback:** (1) try symlink → (2) on Windows-error, junction → (3) if both fail, fall back to `bun install` + log. The build never blocks.
- Path handling uses `path.resolve` + `path.join` (no hardcoded separators) — correct on backslash (Windows) + forward-slash (POSIX).
- **Committed (portable):** the fetch script, seeded sources, allowlist, golden-dep list, symlink-with-fallback code. **Per-machine (gitignored, regenerated):** the actual `node_modules` tree, the build workspaces.
- A contributor on any OS clones, runs `bun install` (platform deps), starts infra; their first generated build provisions the golden `node_modules` for their machine (one install), then reuses. No admin/developer-mode/OS-specific manual steps.

**Composes with Section 1:** the golden dep set includes the full shadcn Radix deps, so the golden install covers everything the seeded components import.

### Section 3 — Loop detector + per-step timing

Stop the "10min, no output" thrash + show where time goes. Both hook the existing `runCommand` seam in `src/lib/projects/custom-source-generator.ts` (~line 84) — the same place the guard + `agentEditedFiles` tracking already live. No change to the agent's tool surface.

**Loop detector — repeated-exact-call detection:**
- Track each `(tool, args)` pair the agent calls during one generation. Hash `args` to a stable key (so `read_file("src/routes/index.tsx")` called 3× is recognized).
- **At 3 exact repeats** of the same `(tool, args)`, inject a message into the agent's next turn: *"You've called `<tool>` with the same arguments 3 times — this is a loop. Make concrete progress or finish now."* Models course-correct when they can see the loop forming (research-backed).
- **Hard cap backstop:** if the same `(tool, args)` hits **5** repeats (agent ignored the nudge), force-terminate the generation early with a clear `loop_detected` partial state → the existing gate + forced-rewrite handle it (don't burn the full step budget looping).

**Per-step timing + tracing:**
- Log each tool call + its wall-clock duration to `devLog` and the operation trace (which already streams to the workspace timeline via `onOperation`). During a build: `read_file src/routes/index.tsx → 230ms`, `write_file src/components/ui/card.tsx → 1.2s`, `check_app → 4.1s`.
- Makes the bottleneck visible: model-thinking-between-steps vs. slow tool execution vs. thrashing — data, not guesses.

**Right altitude (not over-built):**
- Exact-repeat detection catches the *common* thrash (re-reading the same files — the 601s case). Cheap (`Map` of counts), reliable.
- Hard cap at 5 is a safety valve, not the primary mechanism — the nudge at 3 usually fixes it.
- Per-step timing is pure observability — no behavior change, just visibility.
- Composes with the step-cut (`AI_AGENT_GENERATE_MAX_STEPS="12"`): with thrash killed, fewer steps run safely — the two reinforce each other.

## Security (verified)

- **No shell / no CLI at build time.** The agent tool runner (`src/lib/projects/agent-tool-runner.ts:17-29`) exposes only file ops (`check_app`, `list_files`, `read_file`, `search_files`, `write_file`, `replace_in_file`, `read_skill`). No `exec`/`spawn`/`install`. The AI cannot run `shadcn add`, `npm install`, or any shell command. This spec preserves that: full-seed + symlink, not a CLI tool.
- **No prompt-injection → install path.** A malicious brief saying "install evil" can't reach the shell (no tool). Even hand-writing `evil-pkg` into `package.json` is blocked by the strict dep allowlist (`generated-package-policy.ts`); `package.json` is platform-owned.
- **Seeded components run sandboxed.** A hostile component the AI writes into `src/components/ui/evil.tsx` runs in the sandboxed preview iframe (architecture.md:82, `sandbox allow-scripts`, null origin, no same-origin privileges) — can't touch the platform or other projects. The build runs `--ignore-scripts` (no package lifecycle execution).
- **Shared `node_modules` is read-only** → one bad project can't corrupt it (architecture.md:65).

## Alternatives considered

- **`shadcn-add` CLI tool.** Reintroduces a shell/provisioning path the architecture closed; network at build time = flakiness; a tool the AI must learn. Rejected — pre-seed replaces it (local source, instant, deterministic, offline).
- **Per-project `node_modules` copy** (no symlink). Copies a huge tree per project (hundreds of MB × N) → disk waste + the copy takes time. Rejected.
- **OS bind-mount / Docker volume** for the golden. Cleaner isolation but requires a container/mount dependency the local-process build (architecture.md:97) doesn't have. Premature — revisit when builds are containerized (Stage C).
- **Pre-warm per-project on brief-accept** (background install). Hides install latency behind user thinking time but still installs per-project (more disk, more installs under load). Weaker than sharing.
- **Diversity-over-window loop detection.** Catches broader (alternating A/B) loops. Exact-repeat catches the common case; add broader only if data shows a pattern it misses.

## Key risks

- **Windows symlink privilege.** `fs.symlink` for directories needs dev-mode/admin. Mitigated by the junction fallback (privilege-free) + install fallback. The spec states this explicitly — the junction is the Windows-safe default, not an afterthought.
- **Golden staleness.** If the scaffold deps change (e.g. Section 1) and the golden isn't re-provisioned, builds could use stale deps. Mitigated by the dependency-signature check — a changed signature triggers exactly one golden re-install on the next build.
- **Full-seed dep sprawl.** ~40 components pull ~20 Radix + helper deps into the allowlist. Mechanical but thorough; one-time. Risk: a missed dep → build-policy rejection. Mitigated by fetching the actual component sources (deps are read from their imports) before finalizing the allowlist.
- **Loop-detector false positives.** Legitimate repeated calls (e.g. `check_app` after each edit) could trip the detector. Mitigated by hashing the full `(tool, args)` pair — `check_app` takes no args, so the detector keys it as `("check_app", "")`; if an agent calls `check_app` 3× in a row *without any intervening `write_file`/`replace_in_file`*, that IS a loop (no edits between checks = thrash), so the nudge is correct. A legitimate workflow edits-then-checks, so consecutive `check_app` calls are separated by different write args and don't match. Verify in the plan against real traces; tune the threshold (3/5) if a legitimate pattern trips it.
- **Per-step timing noise.** Operation trace + `devLog` could get verbose. Mitigated by keeping timing to a single structured log line per step (not the full tool output).

## Invariants preserved (architecture.md)

- No shell/CLI at build time.
- One bad project must not break another (read-only golden `node_modules`; sandboxed preview).
- Preview failures are first-class UI states.
- The visible reply is never regenerated just to repair — the loop detector nudges *during* generation; the runtime self-heal (Stage B, later) fixes source then rebuilds.
- Static-frontend-only (no backend/db/auth/payments).

## Implementation order (dopamine-first, proper)

1. **Section 1** (full shadcn seed + allowlist expansion) — committed; immediately try generating with the full component palette.
2. **Section 2** (shared node_modules, cross-OS) — committed on top; first-build install → instant symlink.
3. **Section 3** (loop detector + per-step timing) — committed on top; kills thrash + visibility.
4. **Resume Stage B** (runtime self-heal) on the now-fast, finishing build.

Each section: implementer subagent → review-package → task reviewer → fix loop if needed → gate green → commit. User tries between sections.

## Success criteria

- Section 1: a generated project's `src/components/ui/` has the full shadcn set; the AI can `import` any (e.g. `Dialog`, `Accordion`) without a CLI or build failure; unused ones are tree-shaken from the bundle.
- Section 2: a new project's first build skips `bun install` (symlinks the golden `node_modules`, read-only); the build succeeds; repeat builds + cross-project builds reuse the golden without re-installing. Works on Windows (junction), macOS, Linux. A missing/corrupt golden falls back to `bun install` without blocking.
- Section 3: a generation that repeats the same `(tool, args)` 3× gets the nudge; 5× force-terminates as `loop_detected`; per-step timing is visible in `devLog` + the operation trace. The 601s-no-output failure mode no longer occurs.
- Overall: a generated project builds + renders in **1-3 minutes total**, finishing reliably.

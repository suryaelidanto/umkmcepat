# WhatsApp UMKM Discussion Group Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep three contextual `Join WhatsApp` buttons while the footer remains a plain `Join Whatsapp` link beside Github.

**Architecture:** Keep the shared URL and existing button treatments for homepage, waitlist success, and pending banner unchanged. Revert only `Footer` so its WhatsApp destination renders as a plain link directly beside Github.

**Tech Stack:** React 19, TypeScript, TanStack Start/Router, Tailwind CSS, Vitest, React server rendering, Storybook.

## Global Constraints

- Homepage, waitlist success, and pending banner use the exact visible label `Join WhatsApp`. Footer uses `Join Whatsapp`.
- Homepage, waitlist, and pending banner render with the existing `Button` primitive; footer renders as a plain link.
- The invite URL remains `https://chat.whatsapp.com/BzxjAg9SMfQK7dUHmUKxbg`.
- Every placement opens a new tab with `rel="noopener noreferrer"`.
- Waitlist success uses a solid white button; homepage and pending banner use compact outline buttons; footer remains a plain link.
- The pending waitlist-status action remains primary.
- Do not add navigation items, floating controls, popups, sticky banners, icons, dependencies, or WhatsApp-green styling.
- Leave unrelated commits and files untouched.

---

## File Structure

- Modify `src/components/common/Footer.tsx`: render `Join Whatsapp` as a plain footer link directly beside Github.
- Modify `src/components/community/WhatsAppCommunityInvite.test.ts`: assert three `Join WhatsApp` buttons and a plain footer `Join Whatsapp` link.
- `src/components/community/WhatsAppCommunityInvite.tsx` and `src/routes/_main.index.tsx` require no change for this footer-only rollback.
- `src/routes/_main.waitlist.tsx` and `src/stories/WhatsAppCommunityInvite.stories.tsx` require no structural change because they consume the shared component.

### Task 1: Specify the revised button behavior

**Files:**
- Modify: `src/components/community/WhatsAppCommunityInvite.test.ts`

**Interfaces:**
- Consumes: `WhatsAppCommunityInvite({ variant }: { variant: "homepage" | "waitlist" })`
- Verifies: all WhatsApp links use `Join WhatsApp` and button markup.

- [ ] **Step 1: Change tests before production code**

Update the prominent component assertions:

```ts
expect(markup).toContain("Join WhatsApp");
expect(markup).not.toContain("Gabung Grup WhatsApp");
expect(markup).toContain('data-slot="button"');
```

Update source assertions for the pending banner and footer:

```ts
expect(homeSource).toContain('<Button asChild size="sm" variant="outline">');
expect(homeSource).toContain("Join WhatsApp");
expect(footerSource).toContain('<Button asChild size="sm" variant="outline">');
expect(footerSource).toContain("Join WhatsApp");
expect(footerSource).not.toContain("Grup WhatsApp UMKM");
```

- [ ] **Step 2: Run tests and verify RED**

Run: `bunx vitest run --project unit src/components/community/WhatsAppCommunityInvite.test.ts`

Expected: FAIL because production still renders Indonesian text links in the pending banner and footer.

### Task 2: Implement contextual WhatsApp buttons

**Files:**
- Modify: `src/components/community/WhatsAppCommunityInvite.tsx`
- Modify: `src/routes/_main.index.tsx`
- Modify: `src/components/common/Footer.tsx`

**Interfaces:**
- Consumes: `Button` and `WHATSAPP_UMKM_GROUP_URL`.

- [ ] **Step 1: Update the prominent shared CTA**

Change only the shared visible action label:

```tsx
<Link href={WHATSAPP_UMKM_GROUP_URL} rel="noopener noreferrer" target="_blank">
  Join WhatsApp
</Link>
```

Preserve the existing outline homepage and solid waitlist classes.

- [ ] **Step 2: Replace the pending text link**

Wrap the existing external link in the compact outline button:

```tsx
<Button asChild size="sm" variant="outline">
  <Link
    className="border-surface-warm-white/18 bg-transparent text-surface-warm-white hover:bg-surface-warm-white/[0.07]"
    href={WHATSAPP_UMKM_GROUP_URL}
    rel="noopener noreferrer"
    target="_blank"
  >
    Join WhatsApp
  </Link>
</Button>
```

Keep the status button before this action so it remains primary.

- [ ] **Step 3: Replace the footer text link**

Import `Button` and wrap the external footer link:

```tsx
<Button asChild size="sm" variant="outline">
  <Link
    className="border-surface-warm-white/18 bg-transparent text-surface-warm-white hover:bg-surface-warm-white/[0.07]"
    href={WHATSAPP_UMKM_GROUP_URL}
    rel="noopener noreferrer"
    target="_blank"
  >
    Join WhatsApp
  </Link>
</Button>
```

Legal and GitHub destinations remain plain links.

- [ ] **Step 4: Run focused verification**

Run:

```bash
bunx vitest run --project unit src/components/community/WhatsAppCommunityInvite.test.ts
bunx eslint src/components/community/WhatsAppCommunityInvite.tsx src/components/community/WhatsAppCommunityInvite.test.ts src/routes/_main.index.tsx src/components/common/Footer.tsx --max-warnings=0
bunx tsc --noEmit --incremental --tsBuildInfoFile .tsbuildinfo
```

Expected: all commands exit 0.

### Task 3: Restore the plain footer link and verify

**Files:**
- Modify: `src/components/common/Footer.tsx`
- Modify: `src/components/community/WhatsAppCommunityInvite.test.ts`

- [ ] **Step 1: Add a failing footer assertion**

Assert `Footer.tsx` contains a single navigation with `Ketentuan`, `Privasi`, `Github`, and `Join Whatsapp`, does not contain `data-slot="button"`, and keeps the WhatsApp `Link` beside Github using the shared constant.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bunx vitest run --project unit src/components/community/WhatsAppCommunityInvite.test.ts`

Expected: FAIL because the footer still renders a separated outline button.

- [ ] **Step 3: Implement the footer rollback**

Restore one `nav` row ordered `Ketentuan`, `Privasi`, `Github`, then `Join Whatsapp`; render the WhatsApp destination as a plain `Link` with `text-surface-warm-white/50` treatment; remove the standalone `Button` wrapper and its container.

- [ ] **Step 4: Run focused tests, ESLint, and typecheck**

Run the component test, targeted ESLint for the two touched files, and `bunx tsc --noEmit --incremental --tsBuildInfoFile .tsbuildinfo`.

### Task 4: Verify and commit the revision

**Files:**
- Modify: `src/components/community/WhatsAppCommunityInvite.test.ts`
- Modify: `src/components/community/WhatsAppCommunityInvite.tsx`
- Modify: `src/routes/_main.index.tsx`
- Modify: `src/components/common/Footer.tsx`

- [ ] **Step 1: Review the diff**

Run: `git diff --check && git diff --stat && git diff`

Confirm exactly four production placements use `Join WhatsApp`, every placement is a button, hierarchy variants match the spec, and no unrelated file changed.

- [ ] **Step 2: Run the full quality gate**

Run: `bun run check`

Expected: format, lint, typecheck, affected tests, Knip, and docs checks all exit 0.

- [ ] **Step 3: Commit only the revision**

Run:

```bash
git add src/components/community/WhatsAppCommunityInvite.test.ts src/components/community/WhatsAppCommunityInvite.tsx src/routes/_main.index.tsx src/components/common/Footer.tsx
git diff --cached --check
git commit -m "fix(community): make WhatsApp entry points buttons"
```

Expected: one local atomic code commit with four modified files.

- [ ] **Step 4: Inspect final state**

Run: `git status --short --branch --untracked-files=all && git log -5 --oneline`

Expected: no uncommitted files from this revision; `dev` remains local and ahead of `origin/dev`.

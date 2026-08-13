# WhatsApp UMKM Discussion Group Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add restrained WhatsApp discussion-group entry points to the public homepage, waitlist waiting states, and footer without competing with website creation.

**Architecture:** Keep the external invite URL and prominent invitation presentation in one focused `WhatsAppCommunityInvite` component with `homepage` and `waitlist` variants. Existing route and footer layouts own their lighter text-link placements so the reusable component does not become a layout abstraction.

**Tech Stack:** React 19, TypeScript, TanStack Start/Router, Tailwind CSS, Vitest, React server rendering, Storybook.

## Global Constraints

- The invite URL is `https://chat.whatsapp.com/BzxjAg9SMfQK7dUHmUKxbg`.
- All WhatsApp actions open a new tab with `rel="noopener noreferrer"`.
- User-facing copy is Indonesian.
- Do not add a header/mobile-navigation item, popup, floating control, sticky banner, dependency, redirect route, database setting, or WhatsApp-green treatment.
- Homepage uses a secondary outline action; waitlist success uses a primary action; pending banner and footer use plain text links.
- Prominent invitations disclose that the member's phone number may be visible to other members.
- Preserve the waitlist status CTA as the pending homepage banner's primary action.

---

## File Structure

- Create `src/components/community/WhatsAppCommunityInvite.tsx`: invite URL, shared trust copy, and the two prominent visual variants.
- Create `src/components/community/WhatsAppCommunityInvite.test.ts`: server-rendered behavior tests for content, hierarchy classes, and safe external-link attributes.
- Create `src/stories/WhatsAppCommunityInvite.stories.tsx`: reusable homepage and waitlist visual states.
- Modify `src/routes/_main.index.tsx`: render the homepage invitation after the hero and add the quiet pending-state link.
- Modify `src/routes/_main.waitlist.tsx`: render the primary invitation before the secondary home action on the success screen.
- Modify `src/components/common/Footer.tsx`: add the permanent plain WhatsApp link.

### Task 1: Build and test the prominent invitation component

**Files:**
- Create: `src/components/community/WhatsAppCommunityInvite.test.ts`
- Create: `src/components/community/WhatsAppCommunityInvite.tsx`
- Create: `src/stories/WhatsAppCommunityInvite.stories.tsx`

**Interfaces:**
- Produces: `WHATSAPP_UMKM_GROUP_URL: string`
- Produces: `WhatsAppCommunityInvite({ variant }: { variant: "homepage" | "waitlist" }): React.ReactElement`

- [ ] **Step 1: Write the failing component tests**

Create tests that server-render both variants and assert:

```ts
expect(homepage).toContain("Tempat ngobrol untuk pelaku UMKM");
expect(homepage).toContain("Gabung Grup WhatsApp");
expect(homepage).toContain('target="_blank"');
expect(homepage).toContain('rel="noopener noreferrer"');
expect(homepage).toContain("Nomor WhatsApp kamu dapat terlihat oleh anggota grup.");
expect(homepage).toContain("border");
expect(waitlist).toContain("Sambil menunggu, gabung obrolannya");
expect(waitlist).toContain("Kamu bisa bertanya dan kenalan dengan pelaku UMKM lainnya.");
expect(waitlist).toContain("bg-surface-warm-white");
```

- [ ] **Step 2: Run the test and verify RED**

Run: `bunx vitest run --project unit src/components/community/WhatsAppCommunityInvite.test.ts`

Expected: FAIL because `./WhatsAppCommunityInvite` does not exist.

- [ ] **Step 3: Implement the minimal reusable component**

Create a data map for the exact heading/body copy, export the URL constant, and render semantic section content. Use `Button asChild` around an external `Link`; apply `variant="outline"` on homepage and the existing light primary treatment on the dark waitlist surface. Include the privacy note beneath the action.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `bunx vitest run --project unit src/components/community/WhatsAppCommunityInvite.test.ts`

Expected: PASS with both variants covered.

- [ ] **Step 5: Add Storybook states**

Create two fullscreen dark-surface stories named `HomepageSecondary` and `WaitlistPrimary`, each rendering the corresponding component variant at realistic container widths.

### Task 2: Wire every approved entry point

**Files:**
- Modify: `src/routes/_main.index.tsx`
- Modify: `src/routes/_main.waitlist.tsx`
- Modify: `src/components/common/Footer.tsx`
- Modify: `src/components/community/WhatsAppCommunityInvite.test.ts`

**Interfaces:**
- Consumes: `WHATSAPP_UMKM_GROUP_URL`
- Consumes: `WhatsAppCommunityInvite`

- [ ] **Step 1: Extend tests for integration-facing copy**

Read the three owning source files and assert they reference the shared component/URL and approved labels:

```ts
expect(homeSource).toContain("<WhatsAppCommunityInvite variant=\"homepage\" />");
expect(homeSource).toContain("Sambil menunggu, gabung grup diskusi UMKM");
expect(waitlistSource).toContain("<WhatsAppCommunityInvite variant=\"waitlist\" />");
expect(footerSource).toContain("Grup WhatsApp UMKM");
expect(footerSource).toContain("WHATSAPP_UMKM_GROUP_URL");
```

- [ ] **Step 2: Run the test and verify RED**

Run: `bunx vitest run --project unit src/components/community/WhatsAppCommunityInvite.test.ts`

Expected: FAIL because none of the owning surfaces references the invitation yet.

- [ ] **Step 3: Implement approved placements**

In `_main.index.tsx`, render the homepage variant immediately after the hero only for signed-out visitors, before `CommunitySection`. In the existing pending banner, place a plain external link below the status button while retaining that status button as primary.

In `_main.waitlist.tsx`, render the waitlist variant inside `SuccessScreen` after the submission/email explanation and before `Lihat beranda`; restyle `Lihat beranda` as a quiet secondary text link.

In `Footer.tsx`, add a plain external link labeled `Grup WhatsApp UMKM` alongside the existing navigation links.

- [ ] **Step 4: Run focused tests and static checks**

Run:

```bash
bunx vitest run --project unit src/components/community/WhatsAppCommunityInvite.test.ts
bunx eslint src/components/community/WhatsAppCommunityInvite.tsx src/components/community/WhatsAppCommunityInvite.test.ts src/stories/WhatsAppCommunityInvite.stories.tsx src/routes/_main.index.tsx src/routes/_main.waitlist.tsx src/components/common/Footer.tsx --max-warnings=0
bunx tsc --noEmit --incremental --tsBuildInfoFile .tsbuildinfo
```

Expected: all commands exit 0.

### Task 3: Verify and commit the atomic feature

**Files:**
- All files listed above.

- [ ] **Step 1: Review requirements and diff**

Run:

```bash
git diff --check
git diff --stat
git diff
```

Confirm every approved placement exists, no prohibited navigation/floating treatment was added, all external links are safe, and no unrelated file changed.

- [ ] **Step 2: Run the repository quality gate**

Run: `bun run check`

Expected: lock guard, formatting, lint, typecheck, affected tests, Knip, and docs checks all exit 0.

- [ ] **Step 3: Stage only the feature and commit**

Run:

```bash
git add src/components/community/WhatsAppCommunityInvite.tsx src/components/community/WhatsAppCommunityInvite.test.ts src/stories/WhatsAppCommunityInvite.stories.tsx src/routes/_main.index.tsx src/routes/_main.waitlist.tsx src/components/common/Footer.tsx
git diff --cached --check
git commit -m "feat(community): add WhatsApp discussion entry points"
```

Expected: one atomic feature commit containing only the UI, tests, and story.

- [ ] **Step 4: Inspect final repository state**

Run: `git status --short --branch && git log -3 --oneline`

Expected: clean `dev` working tree, ahead of `origin/dev` by the local design, plan, and feature commits.

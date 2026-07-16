# Discussion Mode Field Completeness

Date: 2026-07-16
Status: Draft

## Problem

Discussion mode (intake chat before build) lets the LLM drive questions freely, but there is no required-field guarantee. Result: a build can ship with user-visible fields (WhatsApp number, business name, address, hours) that were never explicitly asked for. Example reported by user: preview at `/projects/cmrizgiav0005ufn8fajqvrvm` shows a WhatsApp number that was never collected during the chat.

The fix is not to bolt on a rigid form — that fights the free-flow nature of the chat. The fix is to make the LLM responsible for knowing what it still needs, and to make "Mulai build" reflect that knowledge.

## Goal

- Every field that ends up rendered in the preview has been either (a) explicitly asked for and answered, or (b) deliberately left empty by the user.
- The conversation stays natural; the LLM is the source of truth for completeness, not a UI checklist.
- "Mulai build" never interrupts with a follow-up question mid-build.

## Non-Goals

- A new form-based or wizard-based intake UI. The chat stays chat.
- Mandatory fields beyond the two hard minimums.
- A user-facing checklist panel.

## Design

### Field classification

Two tiers:

**Mandatory** — must be present in the extracted brief before build is allowed:
- `businessName` — name of the usaha.
- `productOrService` — what the usaha sells or does, at least one sentence.

**Soft** — AI should ask during discussion, but never block build if absent:
- `contact` — primary contact channel (WhatsApp number, phone, Instagram, Maps link, or "none yet").
- `hours` — operating hours, if the usaha has them.
- `address` — physical address / location, if applicable.
- `social` — social media handles, if any.

### AI confidence rule

The LLM has an internal checklist in its system prompt. It is "confident" to allow build when:

- All mandatory fields are present in the transcript or extracted brief, AND
- Either at least one soft field is present, OR the user has explicitly said "skip the rest" / "udah cukup" / similar.

If only mandatory are present and zero soft fields, the AI continues the conversation by asking about the most relevant soft field for the UMKM type (e.g. "ada nomor WA yang bisa dihubungi pelanggan?" for a warung; "ada lokasi toko?" for a kedai fisik). The AI must not repeat a soft field the user already declined.

### Build click flow

When the user clicks "Mulai build":

1. Server runs the existing discuss → extract pipeline. No new guard call after the click.
2. Brief is finalized from the latest transcript.
3. Preview is generated from the brief.
4. Any soft field that is empty is simply absent from the preview — sections for hours, address, contact, social are hidden, not rendered as "—" or "Belum diisi".

The button is enabled as soon as the AI is confident per the rule above. Implementation: the AI emits a `readyForBuild: boolean` signal in each discuss turn (alongside the natural-language reply and any brief patches). The client uses this to enable/disable the button. No new round-trip on click.

### Revision flow

When the user opens the discussion again after a build (e.g. to add hours they forgot):

- The mandatory gate is **not** re-evaluated. The previous build's mandatory fields are still in the brief; they are not invalidated.
- The AI focuses on the user's stated revision. It may incidentally pick up newly mentioned soft fields.
- The "Mulai build" button stays enabled throughout. If the user clicks again, the new brief replaces the old one; the soft fields that were not addressed remain absent in the re-rendered preview.

### Adding info after build

Users can chat any time after a build to add or correct info. The same extract pipeline runs. Each user message after a build is treated as a revision; the resulting brief is what the next preview shows. No special "edit mode" toggle.

### Brief extraction

Keep the current tool-mode extraction (`handleDiscussTurnOneCall` / `repairDiscussCardWithTool` in `src/routes/api.projects.preview.ts`). Add a `readyForBuild: boolean` field to the extracted card. The system prompt instructs the model to set this true only when the confidence rule is satisfied.

### Empty-field rendering

The static site renderer (`src/components/projects/renderer/ProjectSitePreview.tsx` and the live preview iframe) must already hide sections for absent fields. Audit any section that currently renders a placeholder string when the underlying value is null/empty, and switch to "render nothing". The contact section specifically must not render a "Hubungi kami" button without a real target.

## Files Touched

- `src/routes/api.projects.preview.ts` — extend extract schema with `readyForBuild: boolean`; update system prompts (`buildChatSystemPrompt`, `buildCardSystemPrompt`, `buildOneCallSystemPrompt`) with the field checklist and confidence rule.
- `src/lib/projects/brief.ts` — keep `REQUIRED_BRIEF_FIELDS` as the mandatory-only set; add a soft set for the AI checklist.
- `src/components/projects/WorkspaceShell.tsx` — read `readyForBuild` from the latest discuss card, gate the build button on it.
- `src/components/projects/renderer/ProjectSitePreview.tsx` and `src/lib/projects/site-schema.ts` — confirm empty soft fields produce no section, no placeholder.
- Possibly `src/lib/projects/chat-memory.ts` — make sure the soft-field checklist state survives the hidden context the AI sees.

## Testing

- Unit: schema-level test that `readyForBuild` is false when only `businessName` is present and no soft fields, true when one soft field is added, true when user says "skip".
- Manual: a fresh project where user only provides name + product. Confirm the AI continues to ask one more soft question naturally. Confirm the build button is disabled until the AI flips the flag.
- Manual: a project where user says "ga perlu WA dulu". Confirm build enables, preview has no contact section.
- Manual: a revision flow where user adds hours after build. Confirm the button is not re-gated, the re-render shows hours.

## Open Questions

- None blocking. The big judgement calls (mandatory = name + product, build = no post-click guard, soft = AI-driven) are settled.

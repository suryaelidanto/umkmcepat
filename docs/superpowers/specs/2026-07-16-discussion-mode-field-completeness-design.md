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

### Persona

Target user: UMKM Indonesia yang ingin go digital tapi tidak punya budget untuk hire desainer atau developer. Output harus terasa **seriously good and professional** — setara hasil kerja desainer + developer mahal. Itulah value proposition UMKM Cepat: hasil premium, gratis untuk user (subsidi owner).

Implikasi: "lempar semua data" tidak boleh terasa seperti formulir generik. AI harus memilih pertanyaan sesuai tipe usaha, sehingga yang ditanyakan terasa relevan dan berguna untuk membantu mereka berjualan, bukan untuk memenuhi database kita.

### Field classification

Two tiers.

**Mandatory** — must be present in the extracted brief before build is allowed:
1. `businessName` — name of the usaha.
2. `productOrService` — what the usaha sells or does, at least one sentence.

**Soft** — AI should ask during discussion, but never block build if absent. The AI decides per UMKM type which fields are "applicable" and only asks those. The full catalog:

*Informasi usaha:*
3. `tagline` — one-line description, what makes them different. If user has none, AI offers to draft.
4. `usp` — unique selling points, why choose them vs competitors. Free-form; AI extracts bullets.
5. `targetCustomer` — who buys from them. Gold for landing-page copy if the UMKM can answer.
6. `priceRange` — if they have a price list or range. AI normalises "20-50rb" into a clean range.
7. `visuals` — whether they have product photos. If not, AI uses tasteful placeholders.

*Operasional & lokasi:*
8. `contact` — primary channel (WA, phone, Instagram, Maps link, or "none yet").
9. `hours` — operating hours, if applicable.
10. `address` — physical address / location.
11. `deliveryArea` — service or delivery coverage. Relevant for F&B, laundry, jasa.

*Trust & social proof (khas Indonesia, sering dilupakan tapi sering ditanya customer):*
12. `since` — tahun berdiri atau lama pengalaman, format "sejak 2018".
13. `testimonials` — customer reviews, if any. Optional.
14. `certifications` — halal, PIRT, NIB, etc. Especially important for F&B.
15. `paymentMethods` — cash, transfer, e-wallet (QRIS), COD. Often asked by customers, must be on the landing.

*Growth hooks:*
16. `socialLinks` — Instagram, TikTok, Facebook.
17. `currentPromo` — any running discount or promo. Drives urgency.
18. `secondaryCta` — a second action besides the primary contact. "Lihat menu", "Lihat katalog", "Reservasi", "Konsultasi gratis", etc.

### AI confidence rule

The LLM has the 18-field checklist in its system prompt. It is "confident" to allow build when:

- All mandatory fields (1, 2) are present in the transcript or extracted brief, AND
- The AI has asked at least one applicable soft field and either collected an answer, or the user explicitly declined ("ga ada", "skip", "udah cukup"), AND
- At least 50% of the AI-marked-applicable soft fields for this UMKM type are answered or explicitly declined.

The AI decides applicability per field per UMKM type. Example defaults the prompt ships with (tunable later from real data):

- Warung makan / F&B: hours, address, deliveryArea, paymentMethods, priceRange, since. Contact, sosmed, tagline, USP, visuals always applicable.
- Laundry / jasa: hours, address, deliveryArea, priceRange, since. Hours always applicable.
- Toko kelontong / retail: hours, address, paymentMethods, priceRange, since. Sosmed, deliveryArea often not applicable.
- Kursus / jasa konsultasi: hours (kelas schedule), priceRange, socialLinks, secondaryCta. Address, deliveryArea usually not.
- Jasa online-only (desain, penulisan, dll): socialLinks, priceRange, secondaryCta, testimonials. Address, hours, deliveryArea not applicable.

If the user has clearly opted out ("udah dulu", "cukup", "langsung bangun aja"), the confidence rule is satisfied with mandatory only. The AI never repeats a soft field the user already declined. If the user has not opted out and only mandatory is filled, the AI continues by asking the most relevant applicable soft field, with a one-line acknowledgement that they can skip if not relevant.

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

- `src/routes/api.projects.preview.ts` — extend extract schema with `readyForBuild: boolean` and the 18-field brief shape; update system prompts (`buildChatSystemPrompt`, `buildCardSystemPrompt`, `buildOneCallSystemPrompt`) with the full field catalog, applicability defaults per UMKM type, and the confidence rule.
- `src/lib/projects/brief.ts` — `REQUIRED_BRIEF_FIELDS` stays as the 2 mandatory fields. Add a `SOFT_BRIEF_FIELDS` list and a `FIELD_APPLICABILITY` map keyed by UMKM type.
- `src/lib/projects/chat-memory.ts` — track which soft fields have been asked, answered, or declined in the hidden chat context, so the AI does not re-ask.
- `src/components/projects/WorkspaceShell.tsx` — read `readyForBuild` from the latest discuss card, gate the build button on it.
- `src/components/projects/renderer/ProjectSitePreview.tsx` and `src/lib/projects/site-schema.ts` — confirm every soft-field section hides when its underlying value is absent. No placeholder strings ("—", "Belum diisi", "Hubungi kami" with no target). New sections implied by the catalog: USP, since, paymentMethods, deliveryArea, secondaryCta, currentPromo, testimonials, certifications.

## Testing

- Unit: schema-level test for the confidence rule — `readyForBuild` is false when only mandatory is present and zero softs, true when 50% of applicable softs are answered, true when user opts out regardless of soft coverage.
- Unit: applicability map — for each UMKM type fixture, the AI's `readyForBuild` decision uses the type's applicable set, not the global 18.
- Manual: fresh project, user only provides name + product. AI asks one applicable soft (e.g. paymentMethods for F&B). User answers. AI asks one more. Build button enables only after the AI flips the flag.
- Manual: user says "ga perlu WA dulu" — AI marks contact declined, build enables, preview has no contact section.
- Manual: revision flow — user adds hours after build. Button is not re-gated. Re-render shows hours. Earlier soft fields remain in their previous state.
- Manual: warung makan with full data vs laundry with full data — both reach build, but the soft fields each was asked about differ.
- Visual: every soft-field section in the rendered preview hides cleanly when its value is absent. No "—", "Belum diisi", or button-without-target anywhere.

## Open Questions

- **Contact "none yet" semantics**: if a user answers the contact question with "belum ada / belum punya" the AI marks `contact` as **explicitly empty** (not declined), and the contact section is hidden at render. The AI does not re-ask contact in that case. The same convention applies to other soft fields where "tidak ada" is itself an answer.

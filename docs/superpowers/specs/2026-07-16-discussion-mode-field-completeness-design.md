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

Target user: UMKM Indonesia yang ingin go digital tapi tidak punya budget untuk hire desainer atau developer. Output harus terasa **seriously good and professional** — setara hasil kerja desainer + developer mahal. Itulah value proposition UMKM Cepat: hasil premium, 100% gratis untuk user.

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

### Language and voice

- **User-facing copy stays in whatever language the user writes in.** Detect per-message; do not auto-translate. A user mixing Indonesian and English gets a mixed reply that mirrors their style.
- **AI reply language follows the dominant language of the transcript so far.** If the user starts in Indonesian, the AI replies in Indonesian.
- **Preview-rendered copy is in Indonesian by default.** The AI may suggest English in addition to Indonesian for fields like tagline or USP if the user's UMKM serves tourists / expats, but only when context makes that obvious. Otherwise default Indonesian.
- **Brand voice for the AI assistant in the chat:** casual, hangat, tidak kaku, tidak corporate. Pakai "kamu" not "Anda". Pakai bahasa sehari-hari, tidak formal seperti customer service bank. Avoid AI-y filler ("Tentu!", "Tentu saja!", "Saya akan bantu"). Mirror the user's register — kalau user pakai slang Jaksel, AI boleh santai; kalau user pakai bahasa Medan, AI boleh adapt ringan.

### First-message greeting

When a user opens a brand-new project, the AI sends one short opener, not a wall of text. The opener:

- Greets by name if the user is signed in and we have their first name.
- States the goal in one sentence ("gw bakal bantu bikinin halaman jualan buat usahamu").
- Invites the first answer with a low-friction question, e.g. "cerita dikit, usahamu jual apa?" or "nama usahanya apa?".
- No menu, no checklist preview, no apology for being an AI.

### Empty businessName handling

If after the user's first reply there is still no concrete business name in the transcript:

- The AI must ask, plainly, for the name. Example: "eh, gw belum dapet nama usahanya —叫什么? nama brand-nya apa?"
- If the user says they have not decided yet, the AI offers to brainstorm 3 candidate names based on the product/service, and proceeds once the user picks or writes one.
- A name is considered present only if it is a specific, brandable string. "Warung", "Toko", "Kedai" alone are not sufficient — the AI pushes for the full brand name.

### Multi-product UMKM

Many UMKM sell more than one thing (warung with multiple menu items, toko with multiple categories, jasa with multiple service tiers). The brief shape must allow this:

- `productOrService` becomes a structured list. Each item: `{ name: string, description?: string, priceRange?: string, isPrimary?: boolean }`.
- The `isPrimary` flag is set by the AI for the single most prominent offering; the renderer uses it as the headline.
- During discussion, the AI asks "ada beberapa produk/jasa? atau fokus satu dulu?" when the user mentions more than one offering in the same message, and follows up to collect names.
- Single-product UMKM continues to work: the list has length 1 with `isPrimary: true`.

### Testimonials schema

`testimonials` is not free-form text. Each entry:

```
{
  quote: string,           // the customer's words
  author: string,          // customer name, or "Ibu Rina" etc.
  context?: string,        // optional: what they bought, when
  rating?: 1 | 2 | 3 | 4 | 5
}
```

The AI extracts from the user's transcript and asks follow-ups only if the user has clearly stated they have testimonials. If the user is unsure of the exact wording, the AI paraphrases and asks the user to confirm before locking the quote.

### Rich-field data shapes

For fields where the renderer needs structured input, the brief carries a typed shape. Beyond `productOrService` and `testimonials` above:

- `contact`: `{ channel: 'whatsapp' | 'phone' | 'instagram' | 'maps' | 'other', value: string, label?: string }` — `label` is what the button reads (e.g. "Chat WhatsApp", "Lihat di Maps"). If absent, default labels per channel.
- `socialLinks`: `{ platform: 'instagram' | 'tiktok' | 'facebook' | 'youtube' | 'x' | 'other', handle: string, url?: string }[]`.
- `paymentMethods`: `('cash' | 'transfer' | 'qris' | 'ewallet' | 'cod')[]` with optional `{ method, detail? }` for free-form notes.
- `certifications`: `{ name: string, issuer?: string }[]`.
- `hours`: `{ dayRange: string, open: string, close: string, note?: string }[]` — flexible enough for "Senin–Jumat 08.00–21.00", "Sabtu 09.00–15.00", etc.

The renderer is responsible for sane defaults and hiding the whole field when the array is empty. The schema-level types live in `src/lib/projects/brief.ts`.

### Safety: AI confidently wrong

The AI can mark `readyForBuild: true` while having extracted nonsense. Concrete failure modes seen in earlier projects: businessName becoming the generic word the user used ("warung", "toko"), productOrService becoming a one-word restatement, contact being a hallucinated phone number.

Safety rules in the system prompt:

- The AI must only set `readyForBuild: true` when the **last** user turn actually contained the answers (or explicit declines). No leap-of-faith from earlier turns.
- The AI is forbidden from filling any field with a value the user has not provided, except `tagline` and `usp` which the AI may draft if the user explicitly invited it ("bantu bikin tagline dong"). All other hallucinated values are dropped at extraction.
- Server-side: `api.projects.preview.ts` validates the extracted brief against the schema. Any field whose value does not match a "looks real" heuristic (e.g. contact.phone must look like a phone number, contact.instagram must look like a handle, businessName must be > 1 word or a known proper noun) is dropped to null before render. Heuristics live in `src/lib/projects/brief.ts` and are unit-tested.

### Re-discussion constraint

When the chat re-opens after a build, the AI sees the prior transcript and the prior brief. Rules:

- The AI never over-extracts. A message like "warnanya kurang biru" is about color, not a new product.
- The AI never re-asks a soft field that is already filled in the prior brief, unless the user has explicitly cleared it.
- The AI never downgrades a previously filled field to null without the user explicitly saying "hapus", "jangan tampilkan", etc.

### Build handoff

When the user clicks "Mulai build":

- The AI emits one short confirmation line in the chat before the build transitions: "oke, gw bangun dengan [nama], [produk utama], [kontak] — sisanya bisa lo tambahin nanti." (only mentioning the filled, applicable fields).
- The transition to the build UI happens immediately after. No extra round-trip.
- If the user clicks "Mulai build" while soft fields are still in the "asked, no answer yet" state (i.e. the AI asked but the user did not reply and clicked anyway), the build proceeds with those fields empty. The AI does not block; the confirmation line does not mention those fields.

## Out of Scope (deferred)

- **Photo upload.** The `visuals` field is tracked as "does the UMKM have photos" but the chat and brief do not yet carry image bytes or URLs. First release ships without image upload; placeholders are used in the preview. Tracked as a follow-up spec.

## Files Touched

- `src/routes/api.projects.preview.ts` — extend extract schema with `readyForBuild: boolean`, the 18-field brief shape, the typed rich-field shapes (contact, socialLinks, paymentMethods, certifications, hours, testimonials, productOrService list), and the language-detection helper. Update system prompts with the field catalog, applicability defaults, confidence rule, voice rules, first-message greeting, empty-businessName handling, multi-product handling, re-discussion constraint, and safety rules.
- `src/lib/projects/brief.ts` — `REQUIRED_BRIEF_FIELDS` stays as the 2 mandatory fields. Add `SOFT_BRIEF_FIELDS`, `FIELD_APPLICABILITY` map keyed by UMKM type, typed rich-field schemas, and the "looks real" heuristic validator that drops hallucinated values to null.
- `src/lib/projects/chat-memory.ts` — track which soft fields have been asked, answered, declined, or explicitly-empty in the hidden chat context, plus the dominant language of the transcript.
- `src/components/projects/WorkspaceShell.tsx` — read `readyForBuild` from the latest discuss card, gate the build button on it. Render the AI's one-line build confirmation in the chat.
- `src/components/projects/renderer/ProjectSitePreview.tsx` and `src/lib/projects/site-schema.ts` — confirm every soft-field section hides when its underlying value is absent, including the new rich-field sections (USP, since, paymentMethods, deliveryArea, secondaryCta, currentPromo, testimonials, certifications, multi-product list). No placeholder strings.

## Testing

- Unit: schema-level test for the confidence rule — `readyForBuild` is false when only mandatory is present and zero softs, true when 50% of applicable softs are answered, true when user opts out regardless of soft coverage.
- Unit: applicability map — for each UMKM type fixture, the AI's `readyForBuild` decision uses the type's applicable set, not the global 18.
- Unit: typed rich-field schemas — `contact`, `socialLinks`, `paymentMethods`, `certifications`, `hours`, `testimonials`, and the `productOrService` list round-trip through serialization.
- Unit: "looks real" heuristic — hallucinated phone numbers, single-word generic business names, and obvious template strings are dropped to null.
- Manual: fresh project, user only provides name + product. AI asks one applicable soft (e.g. paymentMethods for F&B). User answers. AI asks one more. Build button enables only after the AI flips the flag.
- Manual: user says "ga perlu WA dulu" — AI marks contact declined, build enables, preview has no contact section.
- Manual: revision flow — user adds hours after build. Button is not re-gated. Re-render shows hours. Earlier soft fields remain in their previous state.
- Manual: warung makan with full data vs laundry with full data — both reach build, but the soft fields each was asked about differ.
- Manual: multi-product flow — user mentions three menu items in one message. AI asks which is primary. Brief carries the list with one `isPrimary`.
- Manual: empty businessName — user says "belum ada nama" on first turn. AI offers three candidates; user picks. Brief carries the picked name.
- Manual: testimonial — user provides a quote and customer name; AI extracts, normalises, asks for rating if not given.
- Manual: language — user writes in mixed Indo/English; AI mirrors. User writes pure English; AI replies English. Preview copy stays Indonesian unless the UMKM clearly serves non-Indonesian customers.
- Manual: build handoff — clicking "Mulai build" shows one confirmation line in chat with the filled fields named, then transitions. No extra round-trip.
- Visual: every soft-field section in the rendered preview hides cleanly when its value is absent. No "—", "Belum diisi", or button-without-target anywhere.

## Open Questions

- **Contact "none yet" semantics**: if a user answers the contact question with "belum ada / belum punya" the AI marks `contact` as **explicitly empty** (not declined), and the contact section is hidden at render. The AI does not re-ask contact in that case. The same convention applies to other soft fields where "tidak ada" is itself an answer.

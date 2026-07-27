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

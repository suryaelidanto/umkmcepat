# Archetype: service-appointment (barbershop / klinik / studio — slot-based booking)

## matches

- barbershop, klinik, studio foto, studio musik, salon kecantikan dengan janji
- any service where booking a specific time + staff is the core transaction

## recommended_sections

- Slot picker — available times by date and staff member; this IS the product, not a side feature.
- Staff list — named stylists / clinicians with their specialty; choice of staff drives the booking.
- Service menu + duration — each service with a price and time estimate so the slot math is visible.
- Location + arrival note — where to show up and what to bring (e.g. referral for klinik).

## avoid_sections

- Generic hero tagline — "Solusi Kecantikan Anda" hides the actual booking flow.
- Long about section — the provider's biography is secondary to "can I get a slot now?".
- Walk-in-only framing — slot businesses lose value when booking isn't the first action.

## page_count

- landing: one page. `marketing_site` only when service categories (e.g. haircut vs. color vs. treatment) need their own detail pages.

## cta_logic

- Primary: "Pilih jadwal" opening the slot picker. Secondary: "Tanya via WA" only when the service needs triage (e.g. medical consult) before booking.

## visual_hooks

- A real slot grid (date × time), not a "Book now" button that opens a WA chat.
- Staff photos with their specialty tag, not anonymous icons.
- Duration + price visible on each service chip, not on a separate pricing page.

## example_structure

Header (name + location) → Service menu (service + duration + price) → Staff list → Slot picker → Booking CTA ("Pilih jadwal"). Depart when justified — a klinik may require an intake step before the slot picker, surfaced as a short form before the grid.

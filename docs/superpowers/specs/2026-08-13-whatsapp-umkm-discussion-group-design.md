# WhatsApp UMKM Discussion Group Design

**Date:** 2026-08-13

**Status:** Approved, revised after UI review

## Goal

Grow a qualified WhatsApp discussion group for Indonesian UMKM owners and operators without distracting from UMKM Cepat's primary path: discuss, build, preview, edit, and publish.

The group is currently one casual discussion group. It may later become a WhatsApp Community with separate discussion, B2B, and announcement spaces, but that migration is outside this change.

## Product Positioning

Present WhatsApp as a community discussion space first. The visible promise is that UMKM owners can ask questions, exchange experience, and discuss websites or digital marketing. Product updates and future service promotion must not lead the acquisition copy.

Use this destination:

`https://chat.whatsapp.com/BzxjAg9SMfQK7dUHmUKxbg`

## Placement and Hierarchy

### Public homepage

Add one compact section directly after the hero and before the existing open-source contributor content. It is available to signed-out visitors.

- Heading: `Tempat ngobrol untuk pelaku UMKM`
- Body: `Tanya soal usaha, website, atau pemasaran digital. Berbagi pengalaman santai bersama pelaku UMKM lainnya.`
- Action: secondary outline button labeled `Join WhatsApp`
- Privacy note: `Nomor WhatsApp kamu dapat terlihat oleh anggota grup.`

The button must remain visually secondary to the homepage's website-building action.

### Waitlist success screen

Make joining the group the most useful next action after a user submits the waitlist form or returns while their entry is pending.

- Heading: `Sambil menunggu, gabung obrolannya`
- Body: `Kamu bisa bertanya dan kenalan dengan pelaku UMKM lainnya.`
- Primary action: solid white button labeled `Join WhatsApp`
- Secondary action: `Lihat beranda`
- Privacy note: `Nomor WhatsApp kamu dapat terlihat oleh anggota grup.`

The existing waitlist submission confirmation and email-review explanation remain visible above this invitation.

### Pending homepage banner

Keep `Cek status antrean` as the primary action. Add a compact outline button labeled `Join WhatsApp` beside or below it. The WhatsApp action must read as a button without matching the visual weight of the status action.

### Footer

Keep one plain-link row ordered as `Ketentuan`, `Privasi`, `Github`, and `Join Whatsapp`. The WhatsApp destination sits directly beside Github and uses the same understated footer-link treatment, not a button. This footer-specific label intentionally uses `Whatsapp`; the other three placements remain buttons labeled `Join WhatsApp`.

### Main navigation

Do not add WhatsApp to the desktop header or mobile primary navigation. A persistent navigation action would compete with sign-in and website creation. Do not add a floating button, popup, sticky banner, or WhatsApp-green visual treatment.

## Interaction

The homepage, waitlist success, and pending-banner actions use the exact visible label `Join WhatsApp` and render as buttons. The footer uses a plain link labeled `Join Whatsapp`. Every placement opens the external invite in a new browser tab and uses safe external-link attributes. These user-requested English CTAs are explicit exceptions to the product's Indonesian-copy default. Use UMKM Cepat's existing neutral component vocabulary and do not add an icon or dependency.

The direct invite remains explicit in one small shared constant or component boundary so a future WhatsApp Community migration does not require hunting through multiple pages. Do not add a redirect route, database setting, dependency, or admin configuration for this single destination.

## Accessibility and Trust

- Keep visible focus styles and semantic links.
- Button and link labels must make the external destination clear.
- Prominent placements include the phone-number visibility note.
- Do not claim that admins will always answer, that membership is exclusive, or that joining affects waitlist approval.
- Do not use color alone to identify the WhatsApp action.

## Reusable UI

Use one small reusable WhatsApp invitation component for the two prominent invitation surfaces and export the shared destination for the native pending-banner and footer layouts. The homepage, waitlist, and pending-banner surfaces use the existing `Button` primitive with links as children; the footer remains a plain link. Storybook covers the homepage outline and waitlist solid variants.

## Verification

- Component tests verify the invite URL, external-link behavior, button treatment and exact `Join WhatsApp` label on the three prominent placements, the footer's plain `Join Whatsapp` link beside Github, and the privacy note.
- Existing waitlist behavior tests remain green.
- Storybook covers the reusable invitation's homepage-secondary and waitlist-primary presentations if introduced.
- Manually inspect mobile and desktop hierarchy to confirm the WhatsApp action does not compete with the main homepage CTA.
- Run targeted tests, lint, typecheck, and `bun run check` before the implementation commit.

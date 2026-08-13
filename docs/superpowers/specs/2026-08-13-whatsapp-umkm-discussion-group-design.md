# WhatsApp UMKM Discussion Group Design

**Date:** 2026-08-13

**Status:** Approved direction, pending written-spec review

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
- Action: secondary outline button labeled `Gabung Grup WhatsApp`
- Privacy note: `Nomor WhatsApp kamu dapat terlihat oleh anggota grup.`

The button must remain visually secondary to the homepage's website-building action.

### Waitlist success screen

Make joining the group the most useful next action after a user submits the waitlist form or returns while their entry is pending.

- Heading: `Sambil menunggu, gabung obrolannya`
- Body: `Kamu bisa bertanya dan kenalan dengan pelaku UMKM lainnya.`
- Primary action: `Gabung Grup WhatsApp`
- Secondary action: `Lihat beranda`
- Privacy note: `Nomor WhatsApp kamu dapat terlihat oleh anggota grup.`

The existing waitlist submission confirmation and email-review explanation remain visible above this invitation.

### Pending homepage banner

Keep `Cek status antrean` as the primary action. Add one quiet text link below it:

`Sambil menunggu, gabung grup diskusi UMKM →`

Do not add a second button.

### Footer

Add a permanent plain link labeled `Grup WhatsApp UMKM` alongside the existing legal and GitHub links.

### Main navigation

Do not add WhatsApp to the desktop header or mobile primary navigation. A persistent navigation action would compete with sign-in and website creation. Do not add a floating button, popup, sticky banner, or WhatsApp-green visual treatment.

## Interaction

All WhatsApp actions open the external invite in a new browser tab and use safe external-link attributes. Buttons and links use UMKM Cepat's existing neutral component vocabulary; a small WhatsApp icon is optional only if an existing compatible icon is already available.

The direct invite remains explicit in one small shared constant or component boundary so a future WhatsApp Community migration does not require hunting through multiple pages. Do not add a redirect route, database setting, dependency, or admin configuration for this single destination.

## Accessibility and Trust

- Keep visible focus styles and semantic links.
- Button and link labels must make the external destination clear.
- Prominent placements include the phone-number visibility note.
- Do not claim that admins will always answer, that membership is exclusive, or that joining affects waitlist approval.
- Do not use color alone to identify the WhatsApp action.

## Reusable UI

Use one small reusable WhatsApp invitation component only for the two prominent invitation surfaces if it prevents duplicated destination, labels, and privacy copy without forcing the banner or footer into the same layout. Add Storybook coverage if this becomes a reusable visual component. The pending banner and footer remain native to their existing layouts.

## Verification

- Component tests verify the invite URL, external-link behavior, labels, and privacy note.
- Existing waitlist behavior tests remain green.
- Storybook covers the reusable invitation's homepage-secondary and waitlist-primary presentations if introduced.
- Manually inspect mobile and desktop hierarchy to confirm the WhatsApp action does not compete with the main homepage CTA.
- Run targeted tests, lint, typecheck, and `bun run check` before the implementation commit.

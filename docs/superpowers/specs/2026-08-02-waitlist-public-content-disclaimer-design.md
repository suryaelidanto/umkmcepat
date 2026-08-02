# Waitlist public-content disclaimer

## Goal

Before a user submits `/waitlist`, they must understand that **business case-study material** (story answers, business name/type, photos) may appear in public content (e.g. study cases). Account PII (email, etc.) stays private and is already masked in admin via streamer mode.

## Decision

**Inline notice (steps 2 + 3) + confirm dialog on every “Kirim Pendaftaran”.**

No API, schema, or privacy-page change. No consent checkbox. No localStorage skip.

## UX

### Inline callout (steps 2 and 3)

Quiet notice under the step content, above the nav row:

- Title: `Studi kasus konten`
- Body: Cerita usaha dan foto yang kamu kirim bisa dipakai di konten publik (misalnya studi kasus). Jangan isi data sensitif (alamat rumah, nomor rekening, data pelanggan, dan sejenisnya). Nama akun dan email tetap privat.

### Confirm dialog (every submit)

Triggered after client validation when the user taps **Kirim Pendaftaran**, before `submit.mutate()`.

- Title: `Sebelum mengirim`
- Body: same intent, slightly sharper — submission may be used as a public case study; omit secrets; account PII stays private.
- Actions: `Batal` | `Saya paham, kirim`
- Confirm runs existing submit path. Cancel / escape / overlay close does not submit.

## Out of scope

- Server-side consent flag / DB column
- Privacy legal page rewrite
- Streamer mode changes
- Claiming livestream unless product actually streams

## Files

- `src/routes/_main.waitlist.tsx` — notice + dialog state
- Reuse `src/components/ui/dialog.tsx` + `Button`

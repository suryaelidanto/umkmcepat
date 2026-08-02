# Waitlist public-content disclaimer

## Goal

Before a user submits `/waitlist`, they must understand that **business case-study material** (story answers, business name/type, photos) may appear in public content (e.g. study cases). Account PII (email, etc.) stays private and is already masked in admin via streamer mode.

## Decision

**Inline notice (step 3 only) + confirm dialog on every “Kirim Pendaftaran”.**

Submit button stays disabled until the full form is valid and at least one photo has finished uploading (`photoAssetIds.length > 0`).

No API, schema, or privacy-page change. No consent checkbox. No localStorage skip.

## UX

### Inline callout (step 3 only)

Quiet notice under the step content, above the nav row:

- Title: `Studi kasus publik`
- Body: Cerita usaha dan foto yang kamu kirim bisa dipakai sebagai studi kasus publik. Jangan isi data sensitif (alamat rumah, nomor rekening, data pelanggan, dan sejenisnya). Nama akun dan email tetap privat.

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

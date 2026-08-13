# Manrope and Birthstone typography design

## Goal

Replace Plus Jakarta Sans across the UMKM Cepat control-plane with Manrope. Use Birthstone only for the public homepage hero accent “100% Gratis.” so the brand gains a human signature without reducing product UI readability.

## Typography roles

- Manrope: body text, navigation, buttons, labels, headings, authenticated workspace, email fallback declarations, and Storybook foundations.
- Birthstone: only the unauthenticated homepage hero phrase “100% Gratis.”
- System monospace: code and logs, unchanged.
- Generated customer websites: unchanged because they have a separate generated-app design system.

## Loading

Load Manrope weights 400, 500, 600, 700, and 800 from Google Fonts using `display=swap`. Load Birthstone regular only. Preserve the existing preconnect and CSP allowances for Google Fonts.

## Hero treatment

Keep the existing hero copy, animation, white foreground, and green underline. Birthstone replaces only the accent phrase’s font. Its size, line height, tracking, and vertical alignment are tuned separately so the script reads as a signature while remaining legible on mobile and desktop.

## Documentation and stories

Update DESIGN.md and typography-related Storybook copy/tokens so the documented system matches the implementation. Do not change generated-site typography rules.

## Verification

Run formatting/lint checks for touched files, TypeScript typecheck, and the nearest relevant tests. Review the homepage visually at mobile and desktop widths before committing.

# ADR-001: Multi-Route vs Single-Page Landing Generation Strategy

## Status

Accepted

## Context

Indonesian small businesses (cafes, laundry, service shops) prioritize immediate WhatsApp conversion above complex navigation. However, certain businesses (e.g. detailed price catalogs, service menus, multi-location clinics) benefit from dedicated sub-pages (`/menu`, `/tentang`, `/layanan`).

## Decision

1. **Default**: Generate high-converting single-page landing sites with anchor scroll navigation to maximize WhatsApp conversion rate.
2. **Dynamic Multi-Route**: When a user's brief explicitly requests dedicated multi-page separation (e.g. extensive catalog or multi-step booking), the agent compiler generates sub-route files in `src/routes/` using TanStack Router.
3. **Framework**: Retain Vercel AI SDK on server and TanStack Router in scaffold.

## Routing note

Generated sites use TanStack Router's hash history because the preview serves one static entry point. The preview proxy falls back to `index.html` for a missing server path, so application not-found behavior is exercised with a hash route such as `/preview/#/not-a-route`.

# Product

## Register

product

## Platform

web

## Users

Indonesian small-business owners and operators who need a credible web presence without hiring a designer or developer. They often start from a rough business idea, incomplete copy, and limited time. The product should help them clarify the business, generate a useful web app, preview it safely, edit it, and publish when ready.

## Product Purpose

UMKM Cepat is an AI builder platform for Indonesian UMKM websites and full-stack customer-facing web apps. Success means a business owner can move from an informal prompt to a trustworthy, editable, publishable web experience with visible progress, safe defaults, and no hidden technical burden.

The platform is one control-plane app that guides the user, stores project metadata, generates standalone source artifacts, builds previews, and supports review/edit/publish flows without locking generated source to UMKM Cepat internals.

The platform is 100% free for users and subsidized by the owner — every feature is usable without paying. Access is managed via a pilot whitelist with admin approval (initially capped at ~10 active UMKM businesses). Users can optionally buy an Energy Booster (paid, non-expiring extra energy) via a modal in the navbar profile dropdown when the free daily quota runs out; paying never gates features, so the core stays free.

## Brand Personality

Warm, capable, restrained.

The interface should feel like a calm expert helping a busy owner make a practical business decision. It should avoid AI hype, decorative noise, and overpromising. Developer-facing surfaces stay precise and boring; consumer-facing product copy stays plain Indonesian.

## Anti-references

- Generic AI SaaS: purple-blue gradients, glowing buttons, vague “boost productivity” claims, chat bubbles as decoration.
- Template-builder clutter: excessive cards, badge soup, emoji-led decisions, too many equal choices.
- Enterprise coldness: sterile gray dashboards that feel hostile to non-technical owners.
- Fake generated-business claims: invented awards, exact prices, addresses, stock, guarantees, checkout, login, or payment flows.
- Vendor lock-in cues in exported/generated code: generated project source should stand alone and use common conventions such as `DESIGN.md`, `PRODUCT.md`, and `.agents/skills`.

## Design Principles

1. Make the next action obvious. The user should always know whether to discuss, build, preview, edit, retry, or publish.
2. Trust beats spectacle. Use visible progress, clear states, reversible actions, and honest copy before decorative effects.
3. Generated output is inspectable and portable. Source, design context, and agent guidance should be understandable outside the platform.
4. Design serves the business job. Every generated layout, section, and CTA must map to a real customer action.
5. Polish through restraint. Prefer strong hierarchy, spacing, contrast, and state design over gradients, card grids, and motion theater.

## Accessibility & Inclusion

Target WCAG AA for product UI. Preserve keyboard focus, semantic landmarks, readable contrast, reduced-motion alternatives, clear labels, and robust loading/error/empty states. Indonesian customer-facing copy should be concrete and simple. Avoid color-only meaning and tiny text on tinted surfaces.

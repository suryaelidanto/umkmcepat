# Anti AI Slop

Rules for keeping UMKM Cepat precise, human, and professionally crafted.

## Definition

AI slop is output that is polished, generic, and low-value. It sounds helpful but avoids concrete judgment, context, tradeoffs, and craft.

## Core rule

Write and build like a careful professional, not a content generator.

## Writing rules

- Prefer plain words over inflated words.
- Avoid em dashes unless they are truly the best punctuation.
- Avoid generic openings.
- Avoid `not only X, but also Y` framing.
- Avoid words like `seamless`, `robust`, `comprehensive`, `elevate`, `delve`, `unlock`, `leverage`, and `cutting-edge`.
- Delete filler sentences.
- Make one clear point per paragraph.
- Use specific nouns and verbs.
- Say what changed, not how impressive it is.
- Do not over-explain obvious security or common-sense rules in user-facing docs.
- Keep `README.md` timeless. Operational detail belongs in `CONTRIBUTING.md`, `DEV.md`, or `docs/`.

## UI rules

- No generic SaaS hero.
- No default blue-purple gradient unless there is a product reason.
- No random icon/card grids.
- No fake dashboard decorations.
- No animation unless it improves comprehension.
- Use Indonesian for product UI.
- Use real user tasks as layout anchors.

## Code rules

- No abstractions for one implementation.
- No future-proof factories or config unless required now.
- No comments explaining obvious code.
- Delete dead code instead of organizing it.
- Prefer platform features before dependencies.

## Review checklist

Before handoff:

- Could this appear in any AI-generated SaaS repo? If yes, sharpen it.
- Is any sentence decorative rather than useful? Delete it.
- Is any UI section generic? Replace it with product-specific intent.
- Is any code added for later? Delete it.

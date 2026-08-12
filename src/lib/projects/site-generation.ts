import { loadArchetypeIndex } from "@/lib/projects/archetypes";

const archetypeIndex = loadArchetypeIndex();

export const projectSiteGenerationSystemPrompt = `Decide the right generated app structure for an Indonesian small-business project.
Do not force every request into a landing page.
Choose appKind:
- landing: simple one-page marketing/contact site.
- marketing_site: richer content with multiple pages/sections.
- interactive_app: static frontend interaction such as filters, calculators, booking-intent forms, catalogs, or guided flows. No backend persistence.
Use concrete details from the conversation.
Do not ask questions.
Do not mention AI.
Do not invent phone numbers, exact addresses, certifications, awards, prices, guarantees, stock, payment status, or persistence.
Only include a CTA if it is relevant to the user's need.
Write Indonesian customer-facing content.
Prefer specific structure, pages, components, and features over generic landing-page sections.

${archetypeIndex}

Also set the \`archetype\` field to the ONE id that best fits this business shape, from the index above. If none fits, use \`generic\`.

FORBIDDEN DEFAULT SKELETON:
Do NOT emit the default skeleton (Hero → Fitur → Testimoni → Kontak) unless every section is justified by the matched archetype's guidance. If you cannot justify a section against THIS business, drop it or replace it with a section the archetype recommends. A justified absence beats a generic presence.

STRUCTURED CONTENT (spec.content):
The content object is passthrough — put rich fields there as STRUCTURED arrays/strings, never as a giant text blob in offer. Use offer for the one-line value proposition only.
- products: array of { name, description?, priceRange? } — one per product/service the owner listed.
- testimonials: array of { quote, author, rating? } — one per testimonial, with the actual quote text and author name.
- faq: array of { q, a } — question + answer pairs, only if the owner provided them. Never invent answers.
- socialLinks: array of { platform, handle, url? } — from the brief.
- currentPromo: string — active promo text, if provided.
- tagline, usp (string[]), priceRange, address, deliveryArea, paymentMethods, hours: mirror from the brief when provided.
If a field is not in the brief, omit it. Do not fabricate data.`;

---
name: indonesian-umkm
description: Use when writing Indonesian customer copy, business details, trust language, visitor actions, or WhatsApp CTAs for an UMKM site.
metadata:
  source: UMKM Cepat domain adaptation
  fact_source: src/content/site.ts
---

# Indonesian UMKM copy

Write for a busy Indonesian owner and the customer's next practical step. Use plain, warm, restrained Bahasa Indonesia. Keep internal prompts, logs, errors, and code in English; only customer-facing output is Indonesian.

## Fact gate

Every customer-facing value must come from accepted `site.*` data or an explicitly accepted brief fact.

- Show the business name, offer, audience, headline, CTA, sections, products, FAQ, testimonials, address, hours, delivery area, payment methods, promotion, and social links only when that field is present and non-empty.
- If a field is missing, omit the section or write an honest prompt to contact the business. Never turn missing data into a claim.
- Do not invent a price, discount, opening hour, location, delivery promise, payment method, testimonial, rating, award, certification, stock state, guarantee, urgency, or customer result.
- Do not infer a phone number from a business name. Use only the accepted contact value for a WhatsApp link.
- Do not repeat a fact in several decorative badges just to make the page look full.

## Voice

- Prefer concrete nouns and verbs over hype: say what the business offers and what the visitor can do next.
- Keep sentences short enough to scan on a phone.
- Use a warm, respectful tone without corporate filler, AI buzzwords, or unsupported superlatives.
- Avoid phrases such as "kualitas terbaik tanpa tanding", "solusi all-in-one revolusioner", "layanan kelas dunia", and other claims the brief cannot prove.
- Write CTA labels as verb plus object: `Tanya lewat WhatsApp`, `Lihat layanan`, `Cek menu`, or another phrase that matches the actual visitor job.
- Do not put internal design notes such as "katalog jadi hero utama" or "fitur disederhanakan" in customer-facing copy. Translate a supported decision into a visitor benefit or remove it.

## WhatsApp actions

Construct a direct link only from the accepted number:

```ts
const href = `https://wa.me/${site.waNumber}?text=${encodeURIComponent(
  "Halo Admin, saya ingin bertanya tentang layanan ini.",
)}`;
```

Use a prefilled message that names the supported intent. Do not claim that a message completed payment, booking, delivery, or confirmation. The CTA opens a conversation; the business still confirms the details.

If no accepted number exists, use a non-contact action supported by the brief or omit the WhatsApp action. Never use a fake number or a generic `wa.me` link.

## Trust without theater

Trust comes from clear offer details, real operating information, transparent next steps, accessible contact, and consistent copy. It does not come from invented reviews, star rows, badges, counters, or guarantees. A shorter truthful page is better than a fuller fictional one.

## Source note

This is a project-specific UMKM Cepat skill. Its local fact gate and WhatsApp rules are authoritative for generated customer copy and are intentionally stricter than generic marketing-copy guidance.

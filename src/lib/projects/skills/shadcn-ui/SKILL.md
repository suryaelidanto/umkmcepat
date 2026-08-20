---
name: shadcn-ui
description: Safe composition patterns for shadcn/ui components, Radix UI slots, Tailwind CSS v4, and touch target standards. Use when composing buttons, cards, badges, sheets, dialogs, and navigation menus.
---

# shadcn/ui Component Composition Standards

Compose production-ready, accessible UI components using Tailwind CSS v4 and Radix UI primitives.

## Safe Component Patterns

1. **Button with `asChild`**:
   - When rendering an anchor inside `<Button asChild>`, ensure the anchor element owns the link attributes:
     ```tsx
     <Button asChild size="lg" className="min-h-11 min-w-11">
       <a href={site.primaryCtaUrl} target="_blank" rel="noreferrer">
         <MessageCircle className="mr-2 size-4" />
         {site.primaryCta}
       </a>
     </Button>
     ```
2. **Icon Sizing inside Buttons & Badges**:
   - Keep Lucide icons at `size-4` (16px) or `size-5` (20px) with `shrink-0`.
   - Never apply `min-h-11 min-w-11` directly onto child `<svg>` elements.
3. **Tailwind v4 Semantic Theme Tokens**:
   - Use semantic color tokens: `bg-primary`, `text-primary-foreground`, `bg-secondary`, `bg-muted`, `bg-card`, `border-border`.
   - Never hardcode arbitrary hex colors unless specifically representing branded third-party icons (e.g. WhatsApp green `#25D366`).

# Reference: Component Design & Styling Tokens

High-quality React codebases maintain strict discipline over component boundaries, prop interfaces, and styling tokens.

---

## 1. The 3 Component Tiers

```
src/
├── components/ui/             # Tier 1: UI Primitives (Design System)
│   ├── button.tsx             # - Headless/accessible (Base UI / Radix)
│   ├── dialog.tsx             # - Zero domain knowledge, zero fetch calls
│   └── card.tsx               # - Styled purely via CVA variants + Tailwind
│
├── components/<domain>/       # Tier 2: Feature Components (Domain UI)
│   ├── waitlist/              # - Encapsulates domain logic & state
│   │   ├── WaitlistFeature.tsx
│   │   └── WaitlistFeature.test.tsx
│   └── support/
│       ├── SupportDashboard.tsx
│       └── TicketThreadView.tsx
│
└── routes/                    # Tier 3: Layout Shells & Thin Routes
    ├── _main.tsx              # - Page-level scaffolding & router outlets
    └── _main.waitlist.tsx     # - Thin delivery shell delegating to Tier 2
```

---

## 2. Anti-Patterns & Best Practices

### Anti-Pattern 1: Nested Render Functions
```tsx
// ❌ WRONG: Re-created on every render, loses focus, pollutes component scope
function UserProfile() {
  function renderHeader() {
    return <header>...</header>;
  }
  return <div>{renderHeader()}</div>;
}

// ✅ RIGHT: Extracted into a dedicated sub-component
function ProfileHeader() {
  return <header>...</header>;
}

function UserProfile() {
  return (
    <div>
      <ProfileHeader />
    </div>
  );
}
```

### Anti-Pattern 2: Boolean Prop Explosion
```tsx
// ❌ WRONG: 15 boolean flags leading to impossible or contradictory states
<Card isCompact hasBorder isBlue isHighlighted isEditable hasCloseButton />

// ✅ RIGHT: Compound Components or Discriminated Union Props
<Card variant="highlighted">
  <Card.Header>
    <Card.Title>Title</Card.Title>
    <Card.Actions editable onDismiss={...} />
  </Card.Header>
  <Card.Body>...</Card.Body>
</Card>
```

### Discriminated Union Props for Mutually Exclusive States
```tsx
type DialogProps =
  | { mode: "create"; initialData?: never; onSubmit: (data: NewItem) => void }
  | { mode: "edit"; initialData: ExistingItem; onSubmit: (data: ExistingItem) => void };
```

---

## 3. Styling Token Conventions

1. **Use CVA (Class Variance Authority)** for component variants:
   ```tsx
   export const buttonVariants = cva("inline-flex items-center font-medium transition", {
     variants: {
       variant: {
         primary: "bg-primary text-primary-foreground hover:bg-primary/90",
         outline: "border border-input bg-background hover:bg-accent",
       },
       size: {
         sm: "h-8 px-3 text-xs",
         md: "h-10 px-4 text-sm",
       },
     },
     defaultVariants: { variant: "primary", size: "md" },
   });
   ```
2. **Never Use Arbitrary Magic Numbers** when design tokens exist:
   - Use semantic spacing and colors: `p-spacing-4`, `rounded-radius-lg`, `bg-accent-orange-subtle`.
3. **Merge Classes Safely**:
   - Always use `cn()` (clsx + tailwind-merge) when accepting an external `className` prop.

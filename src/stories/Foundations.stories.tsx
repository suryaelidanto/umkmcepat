import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const meta = {
  parameters: { layout: "fullscreen" },
  title: "Foundations/Design System",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Colors: Story = {
  render: () => (
    <FoundationCanvas
      title="Colors"
      subtitle="Use these tokens before inventing a new color."
    >
      <div className="grid gap-spacing-5 sm:grid-cols-2 lg:grid-cols-3">
        {colors.map((color) => (
          <article
            key={color.name}
            className="rounded-radius-2xl border border-foreground-primary/10 bg-surface-warm-white p-spacing-5 text-foreground-primary"
          >
            <div
              className="h-28 rounded-radius-xl border border-foreground-primary/10"
              style={{ backgroundColor: color.value }}
            />
            <h3 className="mt-spacing-4 text-sm font-semibold">{color.name}</h3>
            <p className="mt-spacing-1 text-sm text-text-secondary">
              {color.value}
            </p>
            <p className="mt-spacing-3 text-xs leading-5 text-text-secondary">
              {color.use}
            </p>
          </article>
        ))}
      </div>
    </FoundationCanvas>
  ),
};

export const Typography: Story = {
  render: () => (
    <FoundationCanvas
      title="Typography"
      subtitle="Plus Jakarta Sans. Tight display tracking, readable body copy."
    >
      <div className="space-y-spacing-7 rounded-radius-3xl bg-surface-warm-white p-spacing-9 text-foreground-primary">
        <TextSample
          label="Display"
          className="text-[60px] font-[480] leading-[60px] tracking-[-0.055em]"
          text="Usahamu layak punya website."
        />
        <TextSample
          label="Heading XL"
          className="text-5xl font-semibold leading-tight tracking-[-0.05em]"
          text="Website UMKM yang rapi."
        />
        <TextSample
          label="Heading LG"
          className="text-4xl font-semibold leading-tight tracking-[-0.045em]"
          text="Lanjutkan website terakhir."
        />
        <TextSample
          label="Body"
          className="max-w-2xl text-base leading-6 text-text-secondary"
          text="Tulis kebutuhan usahamu. AI bantu susun website yang cocok untuk pelangganmu."
        />
        <TextSample
          label="Small"
          className="text-sm leading-6 text-text-secondary"
          text="Gunakan teks kecil untuk metadata, helper, dan status sekunder."
        />
      </div>
    </FoundationCanvas>
  ),
};

export const SpacingAndRadius: Story = {
  render: () => (
    <FoundationCanvas
      title="Spacing & radius"
      subtitle="Spacing token + radius token. Use these shapes consistently."
    >
      <div className="grid gap-spacing-6 lg:grid-cols-2">
        <section className="rounded-radius-3xl bg-surface-warm-white p-spacing-9 text-foreground-primary">
          <h3 className="text-lg font-semibold">Spacing scale</h3>
          <div className="mt-spacing-6 space-y-spacing-4">
            {spacing.map((item) => (
              <div
                key={item.name}
                className="grid grid-cols-[7rem_1fr_4rem] items-center gap-spacing-4 text-sm"
              >
                <span className="font-medium">{item.name}</span>
                <span
                  className="h-3 rounded-full bg-action-primary"
                  style={{ width: item.value }}
                />
                <span className="text-text-secondary">{item.value}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-radius-3xl bg-surface-warm-white p-spacing-9 text-foreground-primary">
          <h3 className="text-lg font-semibold">Radius scale</h3>
          <div className="mt-spacing-6 grid gap-spacing-4 sm:grid-cols-2">
            {radii.map((item) => (
              <div key={item.name}>
                <div
                  className="h-24 border border-foreground-primary/12 bg-surface-muted"
                  style={{ borderRadius: item.value }}
                />
                <p className="mt-spacing-3 text-sm font-medium">{item.name}</p>
                <p className="text-sm text-text-secondary">{item.value}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </FoundationCanvas>
  ),
};

export const Surfaces: Story = {
  render: () => (
    <FoundationCanvas
      title="Surfaces"
      subtitle="Warm light surfaces + controlled dark product surfaces."
    >
      <div className="grid gap-spacing-6 lg:grid-cols-2">
        <section className="rounded-radius-3xl bg-surface-warm-white p-spacing-9 text-foreground-primary">
          <p className="text-sm text-text-secondary">Light surface</p>
          <h3 className="mt-spacing-3 text-3xl font-semibold tracking-[-0.05em]">
            Warm card, low border, no heavy shadow.
          </h3>
          <div className="mt-spacing-6 rounded-radius-2xl border border-foreground-primary/10 bg-surface-muted p-spacing-6 text-sm text-text-secondary">
            Muted nested surface.
          </div>
        </section>
        <section className="rounded-radius-3xl bg-[#151515] p-spacing-9 text-surface-warm-white">
          <p className="text-sm text-surface-warm-white/52">
            Dark product surface
          </p>
          <h3 className="mt-spacing-3 text-3xl font-semibold tracking-[-0.05em]">
            Workspace and dashboard areas stay warm-dark.
          </h3>
          <div className="mt-spacing-6 rounded-radius-2xl border border-surface-warm-white/10 bg-surface-warm-white/[0.055] p-spacing-6 text-sm text-surface-warm-white/58">
            Nested dark card uses opacity, not new palette.
          </div>
        </section>
      </div>
    </FoundationCanvas>
  ),
};

function FoundationCanvas({
  children,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <main className="min-h-screen bg-[#151515] p-spacing-8 text-surface-warm-white sm:p-spacing-12">
      <div className="mx-auto max-w-7xl space-y-spacing-8">
        <header>
          <p className="text-sm font-medium text-surface-warm-white/52">
            Foundations
          </p>
          <h1 className="mt-spacing-4 text-5xl font-semibold tracking-[-0.06em]">
            {title}
          </h1>
          <p className="mt-spacing-4 max-w-2xl text-lg leading-7 text-surface-warm-white/58">
            {subtitle}
          </p>
        </header>
        {children}
      </div>
    </main>
  );
}

function TextSample({
  className,
  label,
  text,
}: {
  className: string;
  label: string;
  text: string;
}) {
  return (
    <div>
      <p className="mb-spacing-2 text-xs font-medium uppercase tracking-[0.16em] text-text-secondary">
        {label}
      </p>
      <p className={className}>{text}</p>
    </div>
  );
}

const colors = [
  {
    name: "surface-base",
    value: "#eceae4",
    use: "Page base and structural warm background.",
  },
  {
    name: "surface-muted",
    value: "#f7f4ed",
    use: "Muted sections, secondary cards, nested panels.",
  },
  {
    name: "surface-warm-white",
    value: "#fcfbf8",
    use: "Cards, dialogs, primary light surfaces.",
  },
  {
    name: "foreground-primary",
    value: "#1c1c1c",
    use: "Text and primary action on light surfaces.",
  },
  {
    name: "text-secondary",
    value: "#5f5f5d",
    use: "Secondary text on light surfaces only.",
  },
  {
    name: "destructive",
    value: "#9f1d1d",
    use: "Real errors or destructive actions only.",
  },
];

const spacing = [
  { name: "spacing-3", value: "6px" },
  { name: "spacing-5", value: "10px" },
  { name: "spacing-7", value: "16px" },
  { name: "spacing-9", value: "24px" },
  { name: "spacing-12", value: "48px" },
  { name: "spacing-14", value: "80px" },
];

const radii = [
  { name: "radius-sm", value: "6px" },
  { name: "radius-lg", value: "12px" },
  { name: "radius-2xl", value: "24px" },
  { name: "radius-3xl", value: "28px" },
];

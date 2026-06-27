import { DarkCard, DarkPage } from "@/components/ui/surface";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const meta = {
  parameters: {
    backgrounds: { default: "Dark workspace" },
    layout: "fullscreen",
  },
  title: "Core UI/Surface",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const DarkPageSurface: Story = {
  render: () => (
    <DarkPage>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-[-0.05em]">Dark page</h1>
        <p className="mt-spacing-4 text-sm leading-6 text-surface-warm-white/58">
          Use for legal, profile, and product dark pages.
        </p>
      </div>
    </DarkPage>
  ),
};

export const DarkCardSurface: Story = {
  render: () => (
    <DarkPage>
      <div className="mx-auto max-w-2xl">
        <DarkCard>
          <h2 className="text-2xl font-semibold tracking-[-0.04em]">
            Dark card
          </h2>
          <p className="mt-spacing-3 text-sm leading-6 text-surface-warm-white/58">
            Reusable contained surface for dark product forms and account UI.
          </p>
        </DarkCard>
      </div>
    </DarkPage>
  ),
};

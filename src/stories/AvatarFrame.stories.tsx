import type { Meta, StoryObj } from "@storybook/react-vite";

import { AvatarFrame } from "@/components/ui/avatar-frame";

const meta = {
  component: AvatarFrame,
  parameters: {
    backgrounds: { default: "Dark workspace" },
    layout: "centered",
  },
  title: "Core UI/Avatar Frame",
} satisfies Meta<typeof AvatarFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Initial: Story = {
  args: {
    className:
      "size-16 bg-surface-warm-white text-xl font-semibold text-foreground-primary",
    image: "",
    initial: "S",
  },
};

export const Image: Story = {
  args: {
    className: "size-16 bg-surface-warm-white",
    image:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' fill='%23ee4f9b'/%3E%3Ccircle cx='72' cy='48' r='34' fill='%23fcfbf8' opacity='.9'/%3E%3C/svg%3E",
    initial: "R",
  },
};

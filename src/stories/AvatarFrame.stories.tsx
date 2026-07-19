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
    className: "size-16 bg-surface-warm-white",
    seed: "Surya",
  },
};

export const CustomSeed: Story = {
  args: {
    className: "size-16 bg-surface-warm-white",
    seed: "UMKM Cepat",
  },
};

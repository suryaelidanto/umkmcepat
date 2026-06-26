import { expect, fn } from "storybook/test";

import { Button } from "@/components/ui/button";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const meta = {
  args: {
    children: "Buat website",
    onClick: fn(),
  },
  argTypes: {
    size: { control: "select", options: ["default", "sm", "lg", "icon"] },
    variant: {
      control: "select",
      options: [
        "default",
        "secondary",
        "outline",
        "ghost",
        "link",
        "destructive",
      ],
    },
  },
  component: Button,
  decorators: [
    (Story) => (
      <div className="rounded-radius-2xl bg-[#151515] p-spacing-8">
        <Story />
      </div>
    ),
  ],
  parameters: {
    backgrounds: { default: "Dark workspace" },
    layout: "centered",
  },
  title: "Core UI/Button",
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    className:
      "bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86",
  },
};

export const Secondary: Story = {
  args: {
    children: "Lihat contoh",
    className:
      "bg-surface-warm-white/8 text-surface-warm-white hover:bg-surface-warm-white/14",
    variant: "secondary",
  },
};

export const Outline: Story = {
  args: {
    children: "Nanti dulu",
    className:
      "border-surface-warm-white/14 bg-transparent text-surface-warm-white/78 hover:bg-surface-warm-white/8 hover:text-surface-warm-white",
    variant: "outline",
  },
};

export const Destructive: Story = {
  args: {
    children: "Hapus",
    className: "bg-[#9f1d1d] text-surface-warm-white hover:bg-[#8b1717]",
    variant: "destructive",
  },
};

export const Disabled: Story = {
  args: {
    children: "Menunggu",
    className:
      "bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86",
    disabled: true,
  },
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole("button", { name: "Menunggu" });
    await expect(button).toBeDisabled();
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

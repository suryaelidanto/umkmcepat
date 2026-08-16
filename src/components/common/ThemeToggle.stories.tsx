import { ThemeToggle } from "./ThemeToggle";

import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Common/ThemeToggle",
  component: ThemeToggle,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

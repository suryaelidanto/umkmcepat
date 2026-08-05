import { fn } from "@storybook/test";

import { DirectEditToolbar } from "./WorkspacePrimitives";

import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  component: DirectEditToolbar,
  args: {
    canUndo: true,
    canRedo: false,
    onUndo: fn(),
    onRedo: fn(),
    onSave: fn(),
    onDiscard: fn(),
  },
} satisfies Meta<typeof DirectEditToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoHistory: Story = {
  args: { canUndo: false, canRedo: false },
};

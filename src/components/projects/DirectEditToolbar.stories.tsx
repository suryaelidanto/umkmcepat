import { DirectEditToolbar } from "./WorkspacePrimitives";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  args: {
    canUndo: true,
    canRedo: false,
    onDiscard: () => {},
    onRedo: () => {},
    onSave: () => {},
    onUndo: () => {},
  },
  component: DirectEditToolbar,
} satisfies Meta<typeof DirectEditToolbar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoHistory: Story = {
  args: { canUndo: false, canRedo: false },
};

import { AdvancedSettingsDisclosure } from "./AdvancedSettingsDisclosure";

import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  component: AdvancedSettingsDisclosure,
  title: "Admin/AdvancedSettingsDisclosure",
} satisfies Meta<typeof AdvancedSettingsDisclosure>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {
  args: {
    children: <p className="text-sm text-surface-warm-white">Isi lanjutan.</p>,
    count: 38,
  },
  decorators: [
    (Story) => (
      <div className="bg-[#151515] p-spacing-4">
        <Story />
      </div>
    ),
  ],
};

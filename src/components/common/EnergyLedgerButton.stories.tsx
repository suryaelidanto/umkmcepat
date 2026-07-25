import type { Meta, StoryObj } from "@storybook/react-vite";

import { EnergyLedgerButton } from "@/components/common/EnergyLedgerButton";

const meta = {
  component: EnergyLedgerButton,
  parameters: {
    backgrounds: { default: "Dark workspace" },
    layout: "padded",
  },
  title: "Product UI/Energy Ledger Button",
} satisfies Meta<typeof EnergyLedgerButton>;

export default meta;
type Story = StoryObj<typeof meta>;

const SHELL_CLASS =
  "flex items-center gap-spacing-3 rounded-radius-md border border-surface-warm-white/10 bg-[#171715] p-spacing-4";

export const Default: Story = {
  args: { projectId: "cproject0001aaaaaaaaaa" },
  render: (args) => (
    <div className={SHELL_CLASS}>
      <EnergyLedgerButton {...args} />
    </div>
  ),
};

export const OpenDialog: Story = {
  args: { projectId: "cproject0001aaaaaaaaaa" },
  render: (args) => (
    <div className={SHELL_CLASS}>
      <EnergyLedgerButton {...args} />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole("button", {
      name: "Lihat riwayat energi",
    });
    await userEvent.click(trigger);
  },
};

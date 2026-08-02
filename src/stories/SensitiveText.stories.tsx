import type { Meta, StoryObj } from "@storybook/react-vite";

import { SensitiveText } from "@/components/admin/SensitiveText";

const meta = {
  args: {
    className: "text-sm",
  },
  argTypes: {
    kind: {
      control: "select",
      options: ["email", "phone", "name", "orderId", "amount"],
    },
  },
  component: SensitiveText,
  decorators: [
    (Story) => (
      <div className="rounded-radius-2xl bg-[#151515] p-spacing-9 text-surface-warm-white">
        <Story />
      </div>
    ),
  ],
  title: "Admin/SensitiveText",
} satisfies Meta<typeof SensitiveText>;
export default meta;

type Story = StoryObj<typeof meta>;

export const EmailMasked: Story = {
  args: { kind: "email", value: "suryaelidanto@gmail.com" },
};

export const PhoneMasked: Story = {
  args: { kind: "phone", value: "081234567890" },
};

export const NameMasked: Story = {
  args: { kind: "name", value: "Toko Sumber Rezeki" },
};

export const OrderIdMasked: Story = {
  args: { kind: "orderId", value: "INV-2026-07-15-000123" },
};

export const AmountMasked: Story = {
  args: { kind: "amount", value: "Rp 25.000" },
};

export const AllKinds: Story = {
  args: { kind: "email", value: "x@y.com" },
  render: () => (
    <div className="flex flex-col gap-spacing-3 text-sm">
      <span>
        email: <SensitiveText kind="email" value="suryaelidanto@gmail.com" />
      </span>
      <span>
        phone: <SensitiveText kind="phone" value="081234567890" />
      </span>
      <span>
        name: <SensitiveText kind="name" value="Toko Sumber Rezeki" />
      </span>
      <span>
        orderId: <SensitiveText kind="orderId" value="INV-2026-07-15-000123" />
      </span>
      <span>
        amount: <SensitiveText kind="amount" value="Rp 25.000" />
      </span>
    </div>
  ),
};

import type { Meta, StoryObj } from "@storybook/react-vite";

import { WhatsAppCommunityInvite } from "@/components/community/WhatsAppCommunityInvite";

const meta = {
  component: WhatsAppCommunityInvite,
  parameters: {
    backgrounds: { default: "Dark workspace" },
    layout: "fullscreen",
  },
  title: "Product UI/WhatsApp Community Invite",
} satisfies Meta<typeof WhatsAppCommunityInvite>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HomepageSecondary: Story = {
  args: { variant: "homepage" },
  render: (args) => (
    <div className="bg-[#151515] pt-spacing-14">
      <WhatsAppCommunityInvite {...args} />
    </div>
  ),
};

export const WaitlistPrimary: Story = {
  args: { variant: "waitlist" },
  render: (args) => (
    <div className="mx-auto flex min-h-dvh max-w-xl items-center bg-[#151515] px-spacing-6">
      <WhatsAppCommunityInvite {...args} />
    </div>
  ),
};

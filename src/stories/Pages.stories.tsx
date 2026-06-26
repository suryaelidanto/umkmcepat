import PrivacyPage from "@/app/(main)/privacy/page";
import TermsPage from "@/app/(main)/terms/page";
import { Footer } from "@/components/common/Footer";
import { SponsorTable } from "@/components/home/SponsorTable";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const meta = {
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  title: "Pages/Static Pages",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Terms: Story = {
  render: () => <TermsPage />,
};

export const Privacy: Story = {
  render: () => <PrivacyPage />,
};

export const FooterLinks: Story = {
  render: () => (
    <main className="min-h-screen bg-surface-base p-spacing-10">
      <Footer />
    </main>
  ),
};

export const SponsorSection: Story = {
  render: () => (
    <main className="min-h-screen bg-[#151515] p-spacing-10">
      <SponsorTable
        sponsors={[
          {
            brandName: "Warung Kopi Sore",
            date: "26 Jun 2026",
            donorName: "Bu Rina",
            support: "Subsidi kuota AI",
            value: "Rp500.000",
          },
          {
            brandName: "Laundry Kilat",
            date: "25 Jun 2026",
            donorName: "Pak Dedi",
            support: "Server bulanan",
            value: "Rp250.000",
          },
        ]}
      />
    </main>
  ),
};

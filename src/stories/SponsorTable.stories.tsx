import { SponsorTable } from "@/components/home/SponsorTable";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const sponsors = [
  {
    donorName: "Ogya",
    brandName: "Zenhosta",
    brandUrl: "https://zenhosta.com/",
    date: "17 Juni 2026",
    support: "Domain",
    value: "Rp250.000",
  },
  {
    donorName: "Rina",
    brandName: "Kopi Sore",
    date: "10 Juni 2026",
    support: "Hosting",
    value: "Rp150.000",
  },
  {
    donorName: "Dedi",
    brandName: "Bengkel Motor Pak Dedi",
    brandUrl: "https://bengkeldedi.example/",
    date: "3 Juni 2026",
    support: "Domain",
    value: "Rp250.000",
  },
  {
    donorName: "Sari",
    brandName: "Katering Sehat",
    date: "28 Mei 2026",
    support: "Hosting",
    value: "Rp150.000",
  },
];

const meta = {
  component: SponsorTable,
  parameters: {
    backgrounds: { default: "Dark workspace" },
  },
  title: "Product UI/Sponsor Table",
} satisfies Meta<typeof SponsorTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  args: { sponsors },
  render: (args) => (
    <div className="bg-[#151515] p-spacing-6">
      <SponsorTable {...args} />
    </div>
  ),
};

export const Empty: Story = {
  args: { sponsors: [] },
  render: Populated.render,
};

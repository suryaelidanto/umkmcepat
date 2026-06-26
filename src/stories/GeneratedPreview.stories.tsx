import { ProjectSitePreview } from "@/components/projects/renderer/ProjectSitePreview";

import type { ProjectSiteSchema } from "@/lib/projects/site-schema";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const mockSiteSchema = {
  audience: "Pekerja kantor sekitar Antapani",
  businessName: "Kopi Sore Bu Rina",
  eyebrow: "Kopi susu rumahan",
  headline: "Kopi segar siap antar sore ini.",
  offer: "Paket kopi susu 1 liter dan botol sekali minum untuk kantor kecil.",
  primaryCta: "Pesan lewat WhatsApp",
  secondaryCta: "Lihat menu",
  sections: [
    {
      title: "Menu ringkas",
      body: "Pelanggan bisa melihat pilihan kopi, ukuran, dan harga tanpa bertanya ulang.",
    },
    {
      title: "Pesan cepat",
      body: "CTA langsung mengarah ke WhatsApp agar pesanan sore bisa diproses cepat.",
    },
    {
      title: "Area antar",
      body: "Tampilkan area pengantaran agar pembeli tahu apakah alamatnya masuk jangkauan.",
    },
    {
      title: "Bukti sosial",
      body: "Sisipkan testimoni pelanggan tetap atau foto produksi harian yang nyata.",
    },
  ],
  subheadline:
    "Bantu pelanggan kantor memilih menu, cek area antar, dan pesan tanpa bolak-balik chat panjang.",
  theme: {
    accent: "#ee4f9b",
    background: "#fcfbf8",
    foreground: "#1c1c1c",
    muted: "#5f5f5d",
  },
  trustPoints: [
    "Dibuat segar harian",
    "Antar area dekat",
    "Pesan via WhatsApp",
  ],
  version: 1,
} satisfies ProjectSiteSchema;

const meta = {
  component: ProjectSitePreview,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  title: "Organisms/Generated Preview",
} satisfies Meta<typeof ProjectSitePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  args: { siteSchema: mockSiteSchema, viewport: "desktop" },
  render: (args) => (
    <main className="min-h-screen bg-surface-base p-spacing-8">
      <ProjectSitePreview {...args} />
    </main>
  ),
};

export const Mobile: Story = {
  args: { siteSchema: mockSiteSchema, viewport: "mobile" },
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: Desktop.render,
};

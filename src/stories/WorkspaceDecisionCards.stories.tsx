import { QuestionComposer } from "@/components/projects/WorkspacePrimitives";
import { WorkspaceCardView } from "@/components/projects/WorkspacePrimitives";

import type { BriefQuestion, WorkspaceCard } from "@/lib/projects/brief";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const meta = {
  parameters: {
    backgrounds: { default: "Dark workspace" },
    layout: "fullscreen",
  },
  title: "Product UI/Workspace Decision Cards",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleQuestion: Story = {
  render: () => (
    <DarkCanvas>
      <div className="max-w-3xl p-spacing-6">
        <QuestionComposer
          question={targetQuestion}
          onSubmit={() => undefined}
        />
      </div>
    </DarkCanvas>
  ),
};

export const BuildRecommendation: Story = {
  render: () => (
    <DarkCanvas>
      <div className="max-w-3xl p-spacing-6">
        <WorkspaceCardView
          card={buildRecommendationCard}
          onBuild={() => undefined}
        />
      </div>
    </DarkCanvas>
  ),
};

function DarkCanvas({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#151515] text-surface-warm-white">
      {children}
    </main>
  );
}

const targetQuestion: BriefQuestion = {
  id: "targetCustomer",
  options: [
    {
      description: "Cocok kalau produk dijual dekat area kantor atau ruko.",
      label: "Pekerja kantor sekitar",
    },
    {
      description: "Cocok untuk harga terjangkau dan pesan cepat.",
      label: "Mahasiswa",
    },
    {
      description: "Cocok kalau pesanan biasanya untuk keluarga.",
      label: "Keluarga",
    },
  ],
  question: "Siapa pembeli utama yang ingin kamu kejar?",
  recommendedOptionLabel: "Pekerja kantor sekitar",
  whyThisQuestionMatters:
    "Target pembeli menentukan headline, CTA, dan bukti sosial.",
};

const buildRecommendationCard = {
  type: "build_recommendation",
  title: "Brief sudah cukup untuk mulai build",
  summary: ["Target jelas", "CTA WhatsApp", "Area layanan disebutkan"],
} satisfies WorkspaceCard;

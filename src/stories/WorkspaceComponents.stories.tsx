import {
  EmptyPreviewState,
  ModePill,
  ProcessingControl,
  QuestionStepperComposer,
  WorkspaceCardView,
  WorkspaceTopBar,
} from "@/components/projects/WorkspacePrimitives";

import type { WorkspaceCard } from "@/lib/projects/brief";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const meta = {
  parameters: {
    backgrounds: { default: "Dark workspace" },
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "Workspace/Real Components",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const TopBarPreview: Story = {
  render: () => (
    <DarkCanvas>
      <WorkspaceTopBar
        activeTab="preview"
        setActiveTab={() => undefined}
        viewport="desktop"
        setViewport={() => undefined}
        chatCollapsed={false}
        openChatPanel={() => undefined}
        closeChatPanel={() => undefined}
      />
    </DarkCanvas>
  ),
};

export const TopBarCodeMobile: Story = {
  render: () => (
    <DarkCanvas>
      <WorkspaceTopBar
        activeTab="code"
        setActiveTab={() => undefined}
        viewport="mobile"
        setViewport={() => undefined}
        chatCollapsed
        openChatPanel={() => undefined}
        closeChatPanel={() => undefined}
      />
    </DarkCanvas>
  ),
};

export const ModePills: Story = {
  render: () => (
    <DarkCanvas>
      <div className="flex gap-spacing-4 p-spacing-6">
        <ModePill mode="Diskusi" tone="idle" />
        <ModePill mode="Diskusi" tone="busy" />
        <ModePill mode="Buat" tone="idle" />
        <ModePill mode="Buat" tone="busy" />
      </div>
    </DarkCanvas>
  ),
};

export const ProcessingDiscuss: Story = {
  render: () => (
    <DarkCanvas>
      <div className="max-w-3xl p-spacing-6">
        <ProcessingControl mode="Diskusi" onStop={() => undefined} />
      </div>
    </DarkCanvas>
  ),
};

export const ProcessingBuild: Story = {
  render: () => (
    <DarkCanvas>
      <div className="max-w-3xl p-spacing-6">
        <ProcessingControl mode="Buat" onStop={() => undefined} />
      </div>
    </DarkCanvas>
  ),
};

export const EmptyPreview: Story = {
  render: () => (
    <div className="h-[32rem] bg-[#10100f]">
      <EmptyPreviewState />
    </div>
  ),
};

export const QuestionStepper: Story = {
  render: () => (
    <DarkCanvas>
      <div className="max-w-3xl p-spacing-6">
        <QuestionStepperComposer
          card={questionsCard}
          hasError={false}
          isRefreshing={false}
          onRefresh={() => undefined}
          onSubmit={() => undefined}
        />
      </div>
    </DarkCanvas>
  ),
};

export const QuestionStepperEmptyOptions: Story = {
  render: () => (
    <DarkCanvas>
      <div className="max-w-3xl p-spacing-6">
        <QuestionStepperComposer
          card={emptyOptionsCard}
          hasError
          isRefreshing={false}
          onRefresh={() => undefined}
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
          hasError={false}
          isRefreshing={false}
          onAnswer={() => undefined}
          onBuild={() => undefined}
          onRefresh={() => undefined}
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

const questionsCard = {
  type: "questions",
  questions: [
    {
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
      ],
      question: "Siapa pembeli utama yang ingin kamu kejar?",
      recommendedOptionLabel: "Pekerja kantor sekitar",
      whyThisQuestionMatters:
        "Target pembeli menentukan headline, CTA, dan bukti sosial.",
    },
    {
      id: "contactOrCta",
      options: [
        {
          description: "Paling cepat untuk UMKM yang menerima pesanan manual.",
          label: "WhatsApp",
        },
        {
          description: "Cocok kalau pelanggan perlu melihat lokasi dulu.",
          label: "Google Maps",
        },
      ],
      question: "Aksi utama pelanggan setelah membuka website apa?",
      recommendedOptionLabel: "WhatsApp",
      whyThisQuestionMatters:
        "CTA utama menentukan struktur halaman dan tombol penting.",
    },
  ],
} satisfies Extract<WorkspaceCard, { type: "questions" }>;

const emptyOptionsCard = {
  type: "questions",
  questions: [
    {
      id: "offer",
      options: [],
      question: "Penawaran utama apa yang paling ingin ditonjolkan?",
      recommendedOptionLabel: "",
      whyThisQuestionMatters:
        "Offer utama menentukan bagian hero dan prioritas konten.",
    },
  ],
} satisfies Extract<WorkspaceCard, { type: "questions" }>;

const buildRecommendationCard = {
  type: "build_recommendation",
  title: "Brief sudah cukup untuk mulai build",
  summary: ["Target jelas", "CTA WhatsApp", "Area layanan disebutkan"],
} satisfies WorkspaceCard;

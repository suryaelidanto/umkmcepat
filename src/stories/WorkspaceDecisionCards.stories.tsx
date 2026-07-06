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

export const MultipleQuestion: Story = {
  render: () => (
    <DarkCanvas>
      <div className="max-w-3xl p-spacing-6">
        <QuestionComposer
          question={multipleQuestion}
          onSubmit={() => undefined}
        />
      </div>
    </DarkCanvas>
  ),
};

export const LongOptionLabels: Story = {
  render: () => (
    <DarkCanvas>
      <div className="max-w-5xl p-spacing-6">
        <QuestionComposer
          question={longOptionsQuestion}
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
          onDiscuss={() => undefined}
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

const multipleQuestion: BriefQuestion = {
  id: "offer",
  options: [
    {
      description: "Produk utama untuk pembeli yang mencari hadiah siap kirim.",
      label: "Hampers kue kering",
    },
    {
      description: "Pilihan yang cocok untuk kantor atau komunitas.",
      label: "Paket kopi lokal",
    },
    {
      description: "Untuk pelanggan yang ingin isi dan kartu ucapan berbeda.",
      label: "Hampers custom",
    },
  ],
  question: "Produk apa saja yang perlu muncul di website?",
  recommendedOptionLabel: "Hampers kue kering",
  selectionMode: "multiple",
  whyThisQuestionMatters:
    "Kalau produk bisa digabung, website perlu menonjolkan beberapa pilihan sekaligus.",
};

const longOptionsQuestion: BriefQuestion = {
  id: "offer",
  options: [
    {
      description:
        "Paket standar angkringan yang paling dikenal. Harga terjangkau, menu sederhana, dan mudah dipahami pelanggan baru.",
      label: "Menu klasik: nasi kucing, sate usus, gorengan, wedang jahe",
    },
    {
      description:
        "Selain menu ringan khas angkringan, ada juga menu yang lebih mengenyangkan untuk pelanggan yang datang malam.",
      label: "Kombinasi klasik + menu berat (nasi goreng, mie goreng)",
    },
    {
      description:
        "Menu angkringan tradisional dipadukan dengan racikan kopi susu, americano, dan minuman modern.",
      label: "Klasik + kopi kekinian",
    },
  ],
  question: "Menu andalan apa yang Anda jual di angkringan?",
  recommendedOptionLabel:
    "Menu klasik: nasi kucing, sate usus, gorengan, wedang jahe",
  whyThisQuestionMatters:
    "Jenis dan jumlah menu menentukan struktur halaman katalog serta bagaimana pengunjung menjelajah sebelum memesan.",
};

const buildRecommendationCard = {
  type: "build_recommendation",
  title: "Brief sudah cukup untuk mulai build",
  summary: ["Target jelas", "CTA WhatsApp", "Area layanan disebutkan"],
} satisfies WorkspaceCard;

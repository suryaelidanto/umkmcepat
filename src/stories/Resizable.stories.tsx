import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const meta = {
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  title: "Atoms/Resizable Panels",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <main className="h-screen bg-[#151515] p-spacing-8 text-surface-warm-white">
      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-[32rem] overflow-hidden rounded-radius-3xl border border-surface-warm-white/10 bg-[#1f1f1d]"
      >
        <ResizablePanel defaultSize={38} minSize={24}>
          <Panel
            title="Diskusi"
            body="Panel kiri untuk chat, brief, dan kartu pertanyaan."
          />
        </ResizablePanel>
        <ResizableHandle withHandle className="bg-surface-warm-white/10" />
        <ResizablePanel defaultSize={62} minSize={36}>
          <Panel
            title="Preview"
            body="Panel kanan untuk preview, source, dan status build."
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </main>
  ),
};

export const Vertical: Story = {
  render: () => (
    <main className="h-screen bg-surface-base p-spacing-8 text-foreground-primary">
      <ResizablePanelGroup
        orientation="vertical"
        className="min-h-[32rem] overflow-hidden rounded-radius-3xl border border-foreground-primary/10 bg-surface-warm-white"
      >
        <ResizablePanel defaultSize={58} minSize={32}>
          <Panel
            title="Konten"
            body="Area utama mengikuti sistem radius dan border yang sama."
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={42} minSize={24}>
          <Panel
            title="Detail"
            body="Cocok untuk state detail tanpa membuat splitter custom."
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </main>
  ),
};

function Panel({ body, title }: { body: string; title: string }) {
  return (
    <section className="flex h-full flex-col justify-between p-spacing-8">
      <div>
        <p className="text-sm opacity-60">Resizable panel</p>
        <h2 className="mt-spacing-3 text-3xl font-semibold tracking-[-0.05em]">
          {title}
        </h2>
        <p className="mt-spacing-4 max-w-md text-sm leading-6 opacity-62">
          {body}
        </p>
      </div>
    </section>
  );
}

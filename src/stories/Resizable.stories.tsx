import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const meta = {
  parameters: { layout: "fullscreen" },
  title: "Core UI/Resizable Panels",
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
            title="Panel kiri"
            body="Demo content only. Use this story to check resize behavior and handle visibility."
          />
        </ResizablePanel>
        <ResizableHandle withHandle className="bg-surface-warm-white/10" />
        <ResizablePanel defaultSize={62} minSize={36}>
          <Panel
            title="Panel kanan"
            body="Real product content belongs in Product UI stories; this story isolates the layout primitive."
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </main>
  ),
};

export const Vertical: Story = {
  render: () => (
    <main className="h-screen bg-[#151515] p-spacing-8 text-surface-warm-white">
      <ResizablePanelGroup
        orientation="vertical"
        className="min-h-[32rem] overflow-hidden rounded-radius-3xl border border-surface-warm-white/10 bg-[#1f1f1d]"
      >
        <ResizablePanel defaultSize={58} minSize={32}>
          <Panel
            title="Panel atas"
            body="Demo content only. The goal is to make resize behavior easy to review."
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={42} minSize={24}>
          <Panel
            title="Panel bawah"
            body="Use this for primitive-level review, not product copy review."
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

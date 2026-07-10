import {
  EmptyPreviewState,
  ModePill,
  PreviewIssueState,
  ProcessingControl,
  VisualFeedbackWidget,
  WorkspaceTopBar,
} from "@/components/projects/WorkspacePrimitives";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const meta = {
  parameters: {
    backgrounds: { default: "Dark workspace" },
    layout: "fullscreen",
  },
  title: "Product UI/Workspace Controls",
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

export const TopBarNarrowMobile: Story = {
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
  render: () => (
    <div className="w-[320px] max-w-full bg-[#151515] text-surface-warm-white">
      <WorkspaceTopBar
        activeTab="preview"
        setActiveTab={() => undefined}
        viewport="mobile"
        setViewport={() => undefined}
        chatCollapsed={false}
        openChatPanel={() => undefined}
        closeChatPanel={() => undefined}
        annotationAvailable
        runtime={{
          buildStatus: "succeeded",
          canPublish: true,
          deploymentStatus: "running",
          onPublish: () => undefined,
        }}
      />
      <div id="workspace-preview-panel" role="tabpanel" hidden />
      <div id="workspace-code-panel" role="tabpanel" hidden />
    </div>
  ),
};

export const TopBarRuntimeRunning: Story = {
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
        runtime={{
          buildStatus: "succeeded",
          canPublish: true,
          deploymentStatus: "running",
          onPublish: () => undefined,
        }}
      />
    </DarkCanvas>
  ),
};

export const TopBarRuntimeStopped: Story = {
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
        runtime={{
          buildStatus: "succeeded",
          canPublish: true,
          deploymentStatus: "stopped",
          onPublish: () => undefined,
        }}
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

export const VisualFeedbackCollapsed: Story = {
  render: () => (
    <DarkCanvas>
      <div className="h-[32rem]">
        <VisualFeedbackWidget
          annotations={[
            {
              id: "annotation-1",
              label: 'Judul utama — "Kopi enak setiap hari"',
              comment: "Judul ini terlalu besar, kecilkan sedikit.",
              target: {
                boundingBox: { height: 64, width: 320, x: 32, y: 80 },
                selectorPath: "main > section.hero > h1",
                tag: "h1",
                text: "Kopi enak setiap hari",
              },
            },
          ]}
          instruction=""
          isSending={false}
          onClose={() => undefined}
          onInstructionChange={() => undefined}
          onRemove={() => undefined}
          onSend={() => undefined}
        />
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

export const PreviewIssue: Story = {
  render: () => (
    <div className="h-[32rem] bg-[#10100f]">
      <PreviewIssueState
        title="Tampilan website gagal dimuat"
        detail="Tampilan website gagal dimuat. Periksa brief lalu jalankan build ulang bila diperlukan."
      />
    </div>
  ),
};

function DarkCanvas({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#151515] text-surface-warm-white">
      {children}
      <div id="workspace-preview-panel" role="tabpanel" hidden />
      <div id="workspace-code-panel" role="tabpanel" hidden />
    </main>
  );
}

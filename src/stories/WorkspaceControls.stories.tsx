import {
  EmptyPreviewState,
  ModePill,
  PreviewIssueState,
  ProcessingControl,
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
          onRetryPreview: () => undefined,
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
          onRetryPreview: () => undefined,
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
        detail="Tampilan website gagal dimuat. Coba muat ulang tampilan atau build ulang kalau masih gagal."
        onRetry={() => undefined}
      />
    </div>
  ),
};

function DarkCanvas({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#151515] text-surface-warm-white">
      {children}
    </main>
  );
}

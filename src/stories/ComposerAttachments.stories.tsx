import type { PendingAttachment } from "@/lib/projects/composer-attachments";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { ComposerAttachments } from "@/components/projects/ComposerAttachments";

const meta = {
  args: { attachments: [], onAdd: () => {}, onRemove: () => {} },
  component: ComposerAttachments,
} satisfies Meta<typeof ComposerAttachments>;

export default meta;

type Story = StoryObj<typeof meta>;

const sample: PendingAttachment[] = [
  {
    blobUrl: "https://placehold.co/48x48/png",
    file: new File([""], "a.png"),
    id: "1",
  },
  {
    blobUrl: "https://placehold.co/48x48/png",
    file: new File([""], "b.png"),
    id: "2",
  },
];

export const Empty: Story = {
  args: { attachments: [] },
};

export const WithThumbnails: Story = {
  args: { attachments: sample },
};

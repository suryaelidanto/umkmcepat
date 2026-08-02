import type { Meta, StoryObj } from "@storybook/react-vite";

import { ImageUploadThumb } from "@/components/ui/image-upload-thumb";

const meta = {
  args: {
    alt: "Pratinjau",
    className: "size-16",
    onRemove: () => {},
    src: "https://placehold.co/64x64/png",
    uploading: false,
  },
  component: ImageUploadThumb,
  parameters: {
    backgrounds: { default: "Dark surface" },
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "UI/ImageUploadThumb",
} satisfies Meta<typeof ImageUploadThumb>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

export const Uploading: Story = {
  args: { uploading: true },
};

export const SmallComposer: Story = {
  args: { className: "size-11", uploading: true },
};

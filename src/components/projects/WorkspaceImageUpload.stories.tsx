import type { Meta, StoryObj } from "@storybook/react-vite";

import { ImageUploadComposer } from "@/components/projects/WorkspacePrimitives";

const meta = {
  args: {
    imageUpload: {
      id: "img1",
      question: "Upload foto produk kamu, ya?",
      hint: "PNG, JPEG, atau WEBP, maksimal 5 MB.",
      purpose: "business-image",
      selectionMode: "single",
    },
    onSubmit: () => {},
  },
  component: ImageUploadComposer,
} satisfies Meta<typeof ImageUploadComposer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SingleImage: Story = {};

export const MultipleImages: Story = {
  args: {
    imageUpload: {
      id: "img1",
      question: "Upload beberapa foto produk.",
      purpose: "business-image",
      selectionMode: "multiple",
    },
  },
};

export const WithRequiredHint: Story = {
  args: {
    imageUpload: {
      id: "img2",
      question: "Upload logo usaha.",
      purpose: "logo",
      selectionMode: "single",
      required: true,
    },
  },
};

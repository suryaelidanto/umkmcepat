import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import type { Meta, StoryObj } from "@storybook/react-vite";

import { FileUpload } from "@/components/ui/file-upload";

const meta = {
  args: {
    endpoint: "/api/projects/demo/assets",
    hint: "PNG, JPG, atau WEBP. Maksimal 5 MB.",
    label: "Unggah foto",
    onError: fn(),
    onUploaded: fn(),
    purpose: "business-image",
  },
  component: FileUpload,
  parameters: {
    backgrounds: { default: "Light surface" },
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "UI/FileUpload",
} satisfies Meta<typeof FileUpload>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => <FileUpload {...args} />,
};

export const Uploading: Story = {
  render: (args) => <FileUpload {...args} />,
  play: async ({ canvasElement }) => {
    // A pending upload should surface the "Mengunggah..." label and disable
    // the input. We simulate by intercepting fetch with a never-resolving
    // promise and dropping a tiny PNG.
    const original = globalThis.fetch;
    globalThis.fetch = () =>
      new Promise(() => {
        /* never resolves */
      });
    const canvas = within(canvasElement);
    const input = canvasElement.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    const file = new File(
      [
        Uint8Array.from(
          Buffer.from(
            "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000005000101f9e0230000000049454e44ae426082",
            "hex",
          ),
        ),
      ],
      "test.png",
      { type: "image/png" },
    );

    await userEvent.upload(input, file);
    await waitFor(() => {
      expect(canvas.getByText("Mengunggah...")).toBeInTheDocument();
    });
    globalThis.fetch = original;
  },
};

export const OversizedRejected: Story = {
  render: (args) => (
    <FileUpload {...args} maxSizeBytes={1} hint="Maksimal 1 byte." />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvasElement.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File([new Uint8Array(8)], "big.png", {
      type: "image/png",
    });
    await userEvent.upload(input, file);
    await waitFor(() => {
      expect(canvas.getByText(/melebihi/i)).toBeInTheDocument();
    });
  },
};

import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import type { Meta, StoryObj } from "@storybook/react-vite";

import { FileUpload } from "@/components/ui/file-upload";

// Browser-safe hex -> bytes. Buffer isn't available in the Storybook browser
// env, and the return must be a Uint8Array<ArrayBuffer> (not ArrayBufferLike) to
// satisfy the DOM BlobPart type used by `new File([...], ...)`.
function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(hex.length / 2);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

const PNG_HEX =
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000005000101f9e0230000000049454e44ae426082";

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

// A valid PNG that exceeds the tiny max triggers the client-side size guard,
// surfacing the "melebihi" error without any network call (robust in the
// headless browser — no fetch mock, no never-resolving promise, no Buffer).
export const OversizedRejected: Story = {
  render: (args) => (
    <FileUpload {...args} maxSizeBytes={1} hint="Maksimal 1 byte." />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvasElement.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File([hexToBytes(PNG_HEX)], "big.png", {
      type: "image/png",
    });
    await userEvent.upload(input, file);
    await waitFor(() => {
      expect(canvas.getByText(/melebihi/i)).toBeInTheDocument();
    });
  },
};

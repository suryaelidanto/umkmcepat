import { expect, screen } from "storybook/test";

import { LoginConsentDialog } from "@/components/common/LoginConsentDialog";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const meta = {
  args: {
    description:
      "Chat kamu sudah disimpan. Setelah masuk, AI akan lanjut otomatis tanpa perlu mengetik ulang.",
    onOpenChange: () => undefined,
    open: true,
    title: "Masuk dulu untuk lanjut",
  },
  component: LoginConsentDialog,
  parameters: {
    backgrounds: { default: "Dark workspace" },
    layout: "centered",
  },
  title: "Product UI/Login Consent",
} satisfies Meta<typeof LoginConsentDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DevCheck: Story = {};

export const HeaderLogin: Story = {
  args: {
    description:
      "Masuk dengan Google untuk menyimpan proyek dan melanjutkan pembuatan website.",
    title: "Masuk ke UMKM Cepat",
  },
};

export const EnablesGoogleAfterChecks: Story = {
  play: async ({ userEvent }) => {
    const googleButton = screen.getByRole("button", {
      name: "Masuk dengan Google",
    });
    await expect(googleButton).toBeDisabled();

    const checkboxes = screen.getAllByRole("checkbox");
    await userEvent.click(checkboxes[0]);
    await userEvent.click(checkboxes[1]);

    await expect(googleButton).toBeEnabled();
  },
};

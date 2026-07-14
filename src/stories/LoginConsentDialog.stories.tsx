import { expect, screen } from "storybook/test";

import type { Meta, StoryObj } from "@storybook/react-vite";

import { LoginConsentDialog } from "@/components/common/LoginConsentDialog";

const meta = {
  args: {
    description:
      "Chat kamu sudah disimpan. Setelah masuk, AI akan lanjut otomatis tanpa perlu mengetik ulang.",
    onOpenChange: () => undefined,
    open: true,
    title: "Masuk dulu untuk lanjut",
    turnstileSiteKey: "",
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

export const TermsGate: Story = {};

export const HeaderLogin: Story = {
  args: {
    description: undefined,
    title: "Masuk ke UMKM Cepat",
  },
};

export const EnablesGoogleAfterConsent: Story = {
  play: async ({ userEvent }) => {
    const googleButton = screen.getByRole("button", {
      name: "Masuk dengan Google",
    });
    await expect(googleButton).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox"));

    await expect(googleButton).toBeEnabled();
  },
};

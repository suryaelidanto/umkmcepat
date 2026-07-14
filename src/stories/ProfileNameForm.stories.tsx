import type { Meta, StoryObj } from "@storybook/react-vite";

import { ProfileNameForm } from "@/components/profile/ProfileNameForm";
import { SessionProvider } from "@/lib/auth-client";

const meta = {
  component: ProfileNameForm,
  decorators: [
    (Story) => (
      <SessionProvider session={null}>
        <main className="min-h-screen bg-[#151515] p-spacing-8 text-surface-warm-white">
          <section className="mx-auto max-w-2xl rounded-radius-3xl border border-surface-warm-white/10 bg-surface-warm-white/[0.055] p-spacing-9">
            <Story />
          </section>
        </main>
      </SessionProvider>
    ),
  ],
  parameters: {
    backgrounds: { default: "Dark workspace" },
    layout: "fullscreen",
  },
  title: "Product UI/Profile Form",
} satisfies Meta<typeof ProfileNameForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoAvatar: Story = {
  args: { initialImage: "", initialName: "Surya" },
};

export const WithAvatar: Story = {
  args: {
    initialImage:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' fill='%23ee4f9b'/%3E%3Ccircle cx='72' cy='48' r='34' fill='%23fcfbf8' opacity='.9'/%3E%3C/svg%3E",
    initialName: "Rina Kopi",
  },
};

export const EmptyName: Story = {
  args: { initialImage: "", initialName: "" },
};

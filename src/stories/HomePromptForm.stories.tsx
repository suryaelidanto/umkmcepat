import { SessionProvider } from "next-auth/react";

import { HomePromptForm } from "@/components/projects/HomePromptForm";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const meta = {
  component: HomePromptForm,
  decorators: [
    (Story) => (
      <SessionProvider session={null}>
        <main className="min-h-screen bg-[#151515] p-spacing-8 text-surface-warm-white">
          <div className="mx-auto grid min-h-[32rem] max-w-5xl place-items-center">
            <Story />
          </div>
        </main>
      </SessionProvider>
    ),
  ],
  parameters: {
    backgrounds: { default: "Dark workspace" },
    layout: "fullscreen",
  },
  title: "Product UI/Home Prompt",
} satisfies Meta<typeof HomePromptForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};

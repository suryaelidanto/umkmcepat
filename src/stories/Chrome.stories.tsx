import { SessionProvider } from "next-auth/react";

import { Footer } from "@/components/common/Footer";
import { Header } from "@/components/common/Header";
import { MainChrome } from "@/components/common/MainChrome";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { Session } from "next-auth";

const meta = {
  decorators: [
    (Story) => (
      <SessionProvider session={null}>
        <Story />
      </SessionProvider>
    ),
  ],
  parameters: {
    backgrounds: { default: "Dark workspace" },
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "Organisms/App Chrome",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const HeaderSignedOut: Story = {
  render: () => <Header />,
};

export const HeaderSignedIn: Story = {
  decorators: [
    (Story) => (
      <SessionProvider session={mockSession}>
        <Story />
      </SessionProvider>
    ),
  ],
  render: () => <Header />,
};

export const FooterDefault: Story = {
  render: () => <Footer />,
};

export const MainChromeDefault: Story = {
  parameters: {
    nextjs: {
      navigation: { pathname: "/" },
    },
  },
  render: () => (
    <SessionProvider session={null}>
      <MainChrome>
        <section className="bg-[#151515] px-4 py-spacing-14 text-surface-warm-white sm:px-spacing-9 lg:px-spacing-10">
          <div className="mx-auto max-w-5xl rounded-radius-3xl border border-surface-warm-white/10 bg-surface-warm-white/[0.055] p-spacing-10">
            <h1 className="text-4xl font-semibold tracking-[-0.05em]">
              Konten halaman
            </h1>
            <p className="mt-spacing-4 text-sm leading-6 text-surface-warm-white/58">
              Chrome memastikan header, konten, dan footer mengikuti warna
              produk.
            </p>
          </div>
        </section>
      </MainChrome>
    </SessionProvider>
  ),
};

const mockSession = {
  expires: "2099-01-01T00:00:00.000Z",
  user: {
    email: "surya@example.com",
    id: "user-storybook",
    image: "",
    name: "Surya Elidanto",
  },
} satisfies Session;

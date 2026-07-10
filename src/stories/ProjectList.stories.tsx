import { ProjectList } from "@/components/projects/ProjectList";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const mockProjects = [
  {
    id: "kopi-rumahan",
    title: "Landing page Kopi Sore Bu Rina",
    updatedAt: new Date("2026-06-25T08:00:00Z"),
  },
  {
    id: "laundry-kilat",
    title: "Website Laundry Kilat Antapani",
    updatedAt: new Date("2026-06-24T09:30:00Z"),
  },
  {
    id: "katering-sehat",
    title: "Katalog Katering Sehat Harian",
    updatedAt: new Date("2026-06-23T11:15:00Z"),
  },
  {
    id: "bengkel-motor",
    title: "Profil Bengkel Motor Pak Dedi",
    updatedAt: new Date("2026-06-22T07:45:00Z"),
  },
];

const meta = {
  component: ProjectList,
  parameters: {
    backgrounds: { default: "Dark workspace" },
    layout: "fullscreen",
  },
  title: "Product UI/Project List",
} satisfies Meta<typeof ProjectList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Full: Story = {
  args: {
    deleteProject: async () => undefined,
    initialProjects: mockProjects,
    initialNextCursor: null,
  },
  render: (args) => (
    <main className="min-h-screen bg-[#151515] p-spacing-8 text-surface-warm-white">
      <ProjectList {...args} />
    </main>
  ),
};

export const SingleProject: Story = {
  args: {
    deleteProject: async () => undefined,
    initialProjects: [mockProjects[0]],
    initialNextCursor: null,
  },
  render: Full.render,
};

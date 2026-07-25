import type { EnergyLedgerEntry } from "@/components/common/EnergyLedger";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { EnergyLedger } from "@/components/common/EnergyLedger";

const meta = {
  component: EnergyLedger,
  parameters: {
    backgrounds: { default: "Dark workspace" },
    layout: "padded",
  },
  title: "Product UI/Energy Ledger",
} satisfies Meta<typeof EnergyLedger>;

export default meta;
type Story = StoryObj<typeof meta>;

const baseEntries: EnergyLedgerEntry[] = [
  {
    amount: -240,
    createdAt: "2026-07-25T09:12:00.000Z",
    id: "cstep1aaaaaaaaaaaaaaaaa",
    inputTokens: 1200,
    outputTokens: 450,
    projectId: "cproject0001aaaaaaaaaa",
    reason: "build:step",
  },
  {
    amount: -1800,
    createdAt: "2026-07-25T09:14:00.000Z",
    id: "cstep2aaaaaaaaaaaaaaaaa",
    inputTokens: 8400,
    outputTokens: 2200,
    projectId: "cproject0001aaaaaaaaaa",
    reason: "build:subagent",
  },
  {
    amount: -90,
    createdAt: "2026-07-25T09:16:00.000Z",
    id: "cstep3aaaaaaaaaaaaaaaaa",
    inputTokens: 600,
    outputTokens: 180,
    projectId: "cproject0001aaaaaaaaaa",
    reason: "build:spec",
  },
  {
    amount: -320,
    createdAt: "2026-07-25T09:18:00.000Z",
    id: "cstep4aaaaaaaaaaaaaaaaa",
    inputTokens: 1500,
    outputTokens: 600,
    projectId: "cproject0001aaaaaaaaaa",
    reason: "discuss:step",
  },
  {
    amount: -120,
    createdAt: "2026-07-25T09:20:00.000Z",
    id: "cstep5aaaaaaaaaaaaaaaaa",
    inputTokens: 700,
    outputTokens: 240,
    projectId: "cproject0001aaaaaaaaaa",
    reason: "edit:step",
  },
  {
    amount: -60,
    createdAt: "2026-07-25T09:22:00.000Z",
    id: "cstep6aaaaaaaaaaaaaaaaa",
    inputTokens: 300,
    outputTokens: 120,
    projectId: "cproject0001aaaaaaaaaa",
    reason: "moderation",
  },
  {
    amount: -210,
    createdAt: "2026-07-25T09:24:00.000Z",
    id: "cstep7aaaaaaaaaaaaaaaaa",
    inputTokens: 1000,
    outputTokens: 400,
    projectId: "cproject0001aaaaaaaaaa",
    reason: "build:repair",
  },
  {
    amount: -75,
    createdAt: "2026-07-25T09:26:00.000Z",
    id: "cstep8aaaaaaaaaaaaaaaaa",
    inputTokens: 360,
    outputTokens: 150,
    projectId: "cproject0001aaaaaaaaaa",
    reason: "discuss:repair",
  },
];

export const Populated: Story = {
  args: { entries: baseEntries, limit: 50 },
};

export const Empty: Story = {
  args: { entries: [], limit: 50 },
};

export const ExhaustedBuild: Story = {
  args: {
    entries: [
      ...baseEntries.slice(0, 4),
      {
        amount: -200000,
        createdAt: "2026-07-25T09:30:00.000Z",
        id: "cstep9aaaaaaaaaaaaaaaaa",
        inputTokens: 95000,
        outputTokens: 48000,
        projectId: "cproject0002aaaaaaaaaa",
        reason: "build:step",
      },
    ],
    limit: 50,
  },
};

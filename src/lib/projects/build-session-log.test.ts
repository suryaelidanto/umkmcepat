import { describe, expect, it, vi } from "vitest";

const { executeRawMock, queryRawMock } = vi.hoisted(() => ({
  executeRawMock: vi.fn(async () => 1),
  queryRawMock: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $executeRaw: executeRawMock,
    $queryRaw: queryRawMock,
  },
}));

import {
  appendBuildSessionLog,
  buildBuildSessionLogMessage,
} from "./build-session-log";

describe("build session log", () => {
  it("writes one success entry with a text line and structured data", () => {
    const message = buildBuildSessionLogMessage({
      attemptId: "att1",
      failed: false,
      projectId: "p1",
      skillsRead: ["impeccable", "unslop"],
      touchedFiles: ["src/routes/index.tsx", "src/content/site.ts"],
      userId: "u1",
    });

    expect(message.id).toBe("build-att1");
    expect(message.role).toBe("assistant");
    const textPart = message.parts.find((part) => part.type === "text") as {
      text: string;
    };
    expect(textPart.text).toContain("Website selesai dibuat");
    expect(textPart.text).toContain("2 bagian");
    const dataPart = message.parts.find(
      (part) => part.type === "data-buildSessionLog",
    ) as { data: { skillsRead: string[]; touchedFiles: string[] } };
    expect(dataPart.data.skillsRead).toEqual(["impeccable", "unslop"]);
    expect(dataPart.data.touchedFiles).toHaveLength(2);
  });

  it("writes a failure entry that keeps the history attachable", () => {
    const message = buildBuildSessionLogMessage({
      attemptId: "att2",
      failed: true,
      projectId: "p1",
      skillsRead: [],
      touchedFiles: [],
      userId: "u1",
    });

    const textPart = message.parts.find((part) => part.type === "text") as {
      text: string;
    };
    expect(textPart.text).toContain("belum selesai");
  });

  it("appends the entry to the stored session exactly once", async () => {
    queryRawMock.mockResolvedValueOnce([{ chatMessages: [] }]);
    await appendBuildSessionLog({
      attemptId: "att3",
      failed: false,
      projectId: "p1",
      skillsRead: [],
      touchedFiles: ["src/content/site.ts"],
      userId: "u1",
    });

    expect(executeRawMock).toHaveBeenCalledTimes(1);
    const serialized = executeRawMock.mock.calls[0]
      ?.map((part) => String(part))
      .join(" ");
    expect(serialized).toContain("build-att3");

    queryRawMock.mockResolvedValueOnce([
      {
        chatMessages: [
          {
            id: "build-att3",
            role: "assistant",
            parts: [{ type: "text", text: "Website selesai dibuat." }],
          },
        ],
      },
    ]);
    await appendBuildSessionLog({
      attemptId: "att3",
      failed: false,
      projectId: "p1",
      skillsRead: [],
      touchedFiles: [],
      userId: "u1",
    });

    expect(executeRawMock).toHaveBeenCalledTimes(1);
  });
});

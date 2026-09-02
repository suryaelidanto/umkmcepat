import { describe, expect, it, vi } from "vitest";

import {
  isSuccessfulBuildStatus,
  persistSuccessfulBuildCheckpoint,
} from "./build-checkpoint";

function createStore(chatMessages: unknown[]) {
  return {
    $queryRaw: vi.fn(async () => [{ chatMessages }]),
    projectBuildCheckpoint: {
      create: vi.fn(
        async ({ data }: { data: Record<string, unknown> }) => data,
      ),
    },
  };
}

describe("successful build checkpoints", () => {
  it("captures the last chat message after a first build", async () => {
    const store = createStore([
      { id: "chat-30", role: "user", parts: [{ type: "text", text: "brief" }] },
      {
        id: "chat-31",
        role: "assistant",
        parts: [{ type: "text", text: "siap" }],
      },
    ]);

    await persistSuccessfulBuildCheckpoint({
      buildId: "build-1",
      kind: "build",
      projectId: "project-1",
      snapshotId: "snapshot-1",
      store: store as never,
    });

    expect(store.projectBuildCheckpoint.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        buildId: "build-1",
        chatMessageId: "chat-31",
        chatMessageIndex: 1,
        kind: "build",
        projectId: "project-1",
        snapshotId: "snapshot-1",
      }),
    });
  });

  it("captures the later chat boundary after an update", async () => {
    const store = createStore([
      {
        id: "chat-31",
        role: "assistant",
        parts: [{ type: "text", text: "built" }],
      },
      { id: "chat-32", role: "user", parts: [{ type: "text", text: "red" }] },
      {
        id: "chat-35",
        role: "assistant",
        parts: [{ type: "text", text: "updated" }],
      },
    ]);

    await persistSuccessfulBuildCheckpoint({
      buildId: "build-2",
      kind: "edit",
      projectId: "project-1",
      snapshotId: "snapshot-2",
      store: store as never,
    });

    expect(store.projectBuildCheckpoint.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        buildId: "build-2",
        chatMessageId: "chat-35",
        chatMessageIndex: 2,
        kind: "edit",
      }),
    });
  });

  it("does not classify failed or canceled operations as successful", () => {
    expect(isSuccessfulBuildStatus("failed")).toBe(false);
    expect(isSuccessfulBuildStatus("canceled")).toBe(false);
  });

  it("classifies only succeeded operations as checkpointable", () => {
    expect(isSuccessfulBuildStatus("succeeded")).toBe(true);
  });
});

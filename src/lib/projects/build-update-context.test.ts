import { type UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
  collectPendingUpdateInstructions,
  resolveBuildUpdateContext,
} from "./build-update-context";

const message = (
  id: string,
  role: "user" | "assistant",
  text: string,
): UIMessage => ({
  id,
  parts: [{ text, type: "text" }],
  role,
});

describe("build update context", () => {
  it("keeps the applied conversation as baseline and returns later requests", () => {
    const result = resolveBuildUpdateContext({
      checkpoint: { chatMessageId: "built", chatMessageIndex: 2 },
      fallbackMessages: [],
      messages: [
        message("brief", "user", "Buat website laundry"),
        message("answer", "assistant", "Siap"),
        message("built", "assistant", "Website siap"),
        message("update", "user", "Buat tombolnya lebih jelas"),
      ],
    });

    expect(result.baselineMessages.map((item) => item.id)).toEqual([
      "brief",
      "answer",
      "built",
    ]);
    expect(result.pendingMessages.map((item) => item.id)).toEqual(["update"]);
  });

  it("starts a fresh pending window after an update checkpoint", () => {
    const result = resolveBuildUpdateContext({
      checkpoint: { chatMessageId: "update-done", chatMessageIndex: 4 },
      fallbackMessages: [],
      messages: [
        message("brief", "user", "Buat website laundry"),
        message("built", "assistant", "Website siap"),
        message("update", "user", "Ganti warna"),
        message("update-done", "assistant", "Sudah diperbarui"),
        message("next", "user", "Tambahkan jam buka"),
      ],
    });

    expect(result.baselineMessages.at(-1)?.id).toBe("update-done");
    expect(result.pendingMessages.map((item) => item.id)).toEqual(["next"]);
  });

  it("retains failed update requests when the checkpoint does not advance", () => {
    const result = resolveBuildUpdateContext({
      checkpoint: { chatMessageId: "built", chatMessageIndex: 1 },
      fallbackMessages: [],
      messages: [
        message("brief", "user", "Buat website laundry"),
        message("built", "assistant", "Website siap"),
        message("failed-update", "user", "Tambahkan katalog"),
        message("failure", "assistant", "Belum berhasil"),
        message("retry", "user", "Coba lagi dengan katalog sederhana"),
      ],
    });

    expect(result.pendingMessages.map((item) => item.id)).toEqual([
      "failed-update",
      "failure",
      "retry",
    ]);
  });

  it("recovers pending messages when compaction proves the boundary was pruned", () => {
    const result = resolveBuildUpdateContext({
      checkpoint: { chatMessageId: "pruned", chatMessageIndex: 1 },
      compactedMessageCount: 4,
      fallbackMessages: [message("old", "user", "Buat website laundry")],
      messages: [message("new", "user", "Tambahkan katalog")],
    });

    expect(result.pendingMessages.map((item) => item.id)).toEqual(["new"]);
  });

  it("does not guess a pending window when the boundary was pruned", () => {
    const result = resolveBuildUpdateContext({
      checkpoint: { chatMessageId: "pruned", chatMessageIndex: 1 },
      fallbackMessages: [message("old", "user", "Buat website laundry")],
      messages: [message("new", "user", "Tambahkan katalog")],
    });

    expect(result.baselineMessages.map((item) => item.id)).toEqual(["old"]);
    expect(result.pendingMessages).toEqual([]);
  });

  it("aggregates only distinct owner requests for the next update", () => {
    const result = collectPendingUpdateInstructions(
      [
        message("first", "user", "Ganti warna"),
        message("reply", "assistant", "Siap"),
        message("duplicate", "user", "Ganti warna"),
        message("second", "user", "Besarkan tombol"),
      ],
      "fallback",
    );

    expect(result).toBe("Ganti warna\n\nBesarkan tombol");
  });
});

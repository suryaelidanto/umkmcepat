import { describe, expect, it } from "vitest";

import { reduceBuildStreamEvent } from "./build-stream-event";

describe("reduceBuildStreamEvent", () => {
  it("turns progress events into build progress updates", () => {
    const result = reduceBuildStreamEvent({
      type: "progress",
      detail: "Membaca brief",
      label: "Memahami usaha",
    });

    expect(result.kind).toBe("progress");
    if (result.kind !== "progress") {
      throw new Error("expected progress");
    }
    expect(result.update([])[0]).toMatchObject({
      detail: "Membaca brief",
      label: "Memahami usaha",
      status: "active",
    });
  });

  it("turns terminal errors into an Indonesian retryable step", () => {
    const result = reduceBuildStreamEvent({
      type: "error",
      detail: "Server restart terputus. Coba jalankan build lagi.",
    });

    expect(result.kind).toBe("error");
    if (result.kind !== "error") {
      throw new Error("expected error");
    }
    expect(result.update([])[0]).toMatchObject({
      label: "Build belum selesai",
      status: "error",
    });
  });

  it("turns tool operation events into transparent progress rows", () => {
    const result = reduceBuildStreamEvent({
      type: "operation",
      title: "Menulis file",
      path: "src/routes/index.tsx",
      detail: "File dibuat atau ditimpa oleh agent.",
      state: "succeeded",
    });

    expect(result.kind).toBe("progress");
    if (result.kind !== "progress") {
      throw new Error("expected progress");
    }
    expect(result.update([])[0]).toMatchObject({
      label: "Menulis file",
      detail: expect.stringContaining("src/routes/index.tsx"),
      status: "done",
    });
  });
});

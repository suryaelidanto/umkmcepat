import { describe, expect, it } from "vitest";

import {
  createBuildStreamDeduper,
  reduceBuildStreamEvent,
} from "./build-stream-event";

describe("createBuildStreamDeduper", () => {
  it("passes events that carry no seq", () => {
    const isFresh = createBuildStreamDeduper();
    const event = { type: "progress" as const, label: "spec" };

    expect(isFresh(event)).toBe(true);
    expect(isFresh(event)).toBe(true);
  });

  it("drops a repeated seq from the same attempt", () => {
    const isFresh = createBuildStreamDeduper();
    const event = {
      type: "progress" as const,
      attemptId: "build_a",
      label: "spec",
      seq: 0,
    };

    expect(isFresh(event)).toBe(true);
    expect(isFresh(event)).toBe(false);
  });

  it("keeps seq spaces separate per attempt", () => {
    const isFresh = createBuildStreamDeduper();

    expect(
      isFresh({
        type: "progress",
        attemptId: "build_a",
        label: "spec",
        seq: 0,
      }),
    ).toBe(true);
    expect(
      isFresh({
        type: "progress",
        attemptId: "build_b",
        label: "spec",
        seq: 0,
      }),
    ).toBe(true);
  });

  it("forgets attempts past the retention bound", () => {
    const isFresh = createBuildStreamDeduper();
    for (const attemptId of ["build_1", "build_2", "build_3", "build_4"]) {
      expect(
        isFresh({ type: "progress", attemptId, label: "spec", seq: 0 }),
      ).toBe(true);
    }

    expect(
      isFresh({
        type: "progress",
        attemptId: "build_1",
        label: "spec",
        seq: 0,
      }),
    ).toBe(true);
  });
});

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

  it("turns terminal errors into a friendly retryable step", () => {
    const result = reduceBuildStreamEvent({
      type: "error",
      detail:
        "Server restart terputus. Agent gagal compile. Coba jalankan build lagi.",
    });

    expect(result.kind).toBe("error");
    if (result.kind !== "error") {
      throw new Error("expected error");
    }
    const step = result.update([])[0];
    expect(step).toMatchObject({
      label: "Website belum selesai",
      status: "error",
    });
    expect(step.detail).not.toMatch(/build/i);
  });

  it("turns tool operation events into friendly progress rows", () => {
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
    const step = result.update([])[0];
    expect(step).toMatchObject({
      label: "Menulis file",
      detail: expect.stringContaining("src/routes/index.tsx"),
      status: "done",
    });
    expect(step.detail).not.toMatch(/writer|agent|worker|batched|compile/i);
  });

  it("keeps expandable file diffs on write/replace operations", () => {
    const diff = [
      { text: "export function HomeRouteComponent() {", type: "add" as const },
      {
        text: "// Replace this with the real home page",
        type: "delete" as const,
      },
    ];
    const result = reduceBuildStreamEvent({
      type: "operation",
      title: "Menulis file",
      path: "src/routes/index.tsx",
      detail: "File dibuat atau ditimpa oleh agent.",
      state: "succeeded",
      tool: "write_file",
      diff,
    });
    expect(result.kind).toBe("progress");
    if (result.kind !== "progress") {
      throw new Error("expected progress");
    }
    const step = result.update([])[0];
    expect(step.diff).toEqual(diff);
    expect(step.diff?.length).toBeGreaterThan(0);
  });
});

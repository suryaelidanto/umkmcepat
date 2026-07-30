import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: vi.fn() },
    projectEditAttempt: { findFirst: vi.fn() },
    runtimeEvent: { findMany: vi.fn() },
  },
}));

import { handleAttemptStreamGet } from "./api.projects.$id.attempts.$attemptId.stream";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishBuildProgress } from "@/lib/projects/build-attempt-pubsub";

describe("handleAttemptStreamGet", () => {
  beforeEach(() => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "user_test" },
    });
    (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "proj",
    });
    (
      prisma.projectEditAttempt.findFirst as ReturnType<typeof vi.fn>
    ).mockReset();
    (prisma.runtimeEvent.findMany as ReturnType<typeof vi.fn>).mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const response = await handleAttemptStreamGet("proj", "build_auth");
    expect(response.status).toBe(401);
  });

  it("returns 404 when project is not owned", async () => {
    (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    const response = await handleAttemptStreamGet("proj", "build_missing");
    expect(response.status).toBe(404);
  });

  it("returns live channel tail when channel is live", async () => {
    publishBuildProgress("build_live", { type: "progress", label: "spec" });
    const response = await handleAttemptStreamGet("proj", "build_live");
    expect(response.headers.get("Content-Type")).toBe(
      "text/event-stream; charset=utf-8",
    );
  });

  it("returns 404 when attempt is not found", async () => {
    (
      prisma.projectEditAttempt.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);
    const response = await handleAttemptStreamGet("proj", "build_none");
    expect(response.status).toBe(404);
  });

  it("replays runtime progress plus done for succeeded attempts", async () => {
    (
      prisma.projectEditAttempt.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: "build_done",
      status: "succeeded",
    });
    (
      prisma.runtimeEvent.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      {
        message: "spec",
        metadata: { detail: "Membuat rancangan", label: "spec" },
      },
    ]);

    const response = await handleAttemptStreamGet("proj", "build_done");
    const text = await response.text();

    expect(text).toContain("event: progress");
    expect(text).toContain('"label":"spec"');
    expect(text).toContain("event: done");
  });

  it("emits synthetic restart error when attempt is running but channel is gone", async () => {
    (
      prisma.projectEditAttempt.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: "build_running",
      status: "running",
    });
    (
      prisma.runtimeEvent.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);

    const response = await handleAttemptStreamGet("proj", "build_running");
    const text = await response.text();

    expect(text).toContain("event: error");
    expect(text).toContain("restart terputus");
  });
});

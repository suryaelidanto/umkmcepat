import { afterEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

vi.mock("@/lib/s3-client", () => ({
  getS3Config: () => ({
    bucket: "pub",
    client: { send: sendMock },
  }),
}));

import { assertProjectArtifactStorageReady } from "@/lib/projects/artifact-storage-readiness";

describe("project artifact storage readiness", () => {
  afterEach(() => {
    sendMock.mockReset();
  });

  it("resolves when the S3 SDK can reach the public bucket", async () => {
    sendMock.mockResolvedValue({});
    await expect(assertProjectArtifactStorageReady()).resolves.toBeUndefined();
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("rejects when the SDK probe fails", async () => {
    sendMock.mockRejectedValue(new Error("EAI_AGAIN"));
    await expect(assertProjectArtifactStorageReady()).rejects.toThrow(
      "S3 storage is not reachable: EAI_AGAIN",
    );
  });

  it("wraps non-Error probe failures with a generic message", async () => {
    sendMock.mockRejectedValue("string error");
    await expect(assertProjectArtifactStorageReady()).rejects.toThrow(
      "S3 storage is not reachable: probe failed",
    );
  });
});

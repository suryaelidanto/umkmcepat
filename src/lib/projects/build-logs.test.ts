import { describe, expect, it } from "vitest";

import {
  classifyBuildFailure,
  getIndonesianBuildFailureSummary,
  sanitizeBuildLog,
} from "@/lib/projects/build-logs";

describe("build logs", () => {
  it("classifies common build failures", () => {
    expect(
      classifyBuildFailure("Generated app manifest failed preflight"),
    ).toBe("manifest_failure");
    expect(
      classifyBuildFailure("Generated app package policy failed preflight"),
    ).toBe("blocked_package");
    expect(classifyBuildFailure("Build timed out.")).toBe("timeout");
    expect(classifyBuildFailure("Artifact write failed.")).toBe(
      "artifact_write_failure",
    );
    expect(classifyBuildFailure("worker crash left build stale")).toBe(
      "stale_worker",
    );
    expect(classifyBuildFailure("Error: Failed to compile")).toBe(
      "compile_error",
    );
  });

  it("redacts secret-shaped values and truncates logs", () => {
    const log = `NINE_ROUTER_API_KEY=abc123 Bearer token.value NEXTAUTH_SECRET=secret ${"x".repeat(20_000)}`;
    const sanitized = sanitizeBuildLog(log);

    expect(sanitized).toContain("NINE_ROUTER_API_KEY=[redacted]");
    expect(sanitized).toContain("Bearer [redacted]");
    expect(sanitized).toContain("NEXTAUTH_SECRET=[redacted]");
    expect(sanitized).not.toContain("abc123");
    expect(sanitized.length).toBeLessThanOrEqual(12_000);
  });

  it("maps failure reasons to Indonesian user summaries", () => {
    expect(getIndonesianBuildFailureSummary("blocked_package")).toContain(
      "paket",
    );
  });

  it("gives concurrency_limit its own message, distinct from stale_worker — hitting the concurrency cap is not the same situation as a build stalling out, and telling the user to 'run again' when the real issue is 'server is busy right now' is misleading", () => {
    const concurrencyMessage =
      getIndonesianBuildFailureSummary("concurrency_limit");
    const staleMessage = getIndonesianBuildFailureSummary("stale_worker");

    expect(concurrencyMessage).not.toBe(staleMessage);
    expect(concurrencyMessage).toMatch(/build lain|tunggu/i);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { assertRuntimeTargetAllowed } from "@/lib/projects/runtime-target-policy";

describe("runtime target policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows an explicitly configured HTTP runtime host and port", () => {
    vi.stubEnv("PROJECT_RUNTIME_ALLOWED_HOSTS", "127.0.0.1,localhost");

    expect(assertRuntimeTargetAllowed("http://127.0.0.1:43123").origin).toBe(
      "http://127.0.0.1:43123",
    );
  });

  it("rejects target drift to credentials, paths, unsafe protocols, or unlisted hosts", () => {
    vi.stubEnv("PROJECT_RUNTIME_ALLOWED_HOSTS", "127.0.0.1");

    expect(() => assertRuntimeTargetAllowed("http://postgres:5432")).toThrow(
      "Runtime target host is not allowed: postgres",
    );
    expect(() => assertRuntimeTargetAllowed("https://127.0.0.1:443")).toThrow(
      "Runtime target protocol must be http:",
    );
    expect(() =>
      assertRuntimeTargetAllowed("http://user:pass@127.0.0.1:8080"),
    ).toThrow("Runtime target cannot include credentials or request data.");
    expect(() =>
      assertRuntimeTargetAllowed("http://127.0.0.1:8080/admin?token=x"),
    ).toThrow("Runtime target cannot include credentials or request data.");
  });
});

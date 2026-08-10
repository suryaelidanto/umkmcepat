import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const s3Mock = vi.fn();
const prodMock = vi.fn();
const providerMock = vi.fn();
const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("@/lib/production-config", () => ({
  assertProductionConfigReady: (...args: unknown[]) => prodMock(...args),
}));
vi.mock("@/lib/provider-startup-check", () => ({
  assertProvidersForProduction: (...args: unknown[]) => providerMock(...args),
}));
vi.mock("@/lib/model-pricing", () => ({
  startModelPricingRefresh: vi.fn(),
}));
vi.mock("@/lib/app-settings", () => ({
  primeSettingCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/projects/attempt-queue", () => ({
  startAttemptQueueWorker: vi.fn(),
}));
vi.mock("@/scripts/init-s3-buckets", () => ({
  ensureS3Buckets: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/projects/artifact-storage-readiness", () => ({
  assertProjectArtifactStorageReady: (...args: unknown[]) => s3Mock(...args),
}));

describe("instrumentation S3 readiness - dev vs prod", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy.mockClear();
    errorSpy.mockClear();
    prodMock.mockReset();
    providerMock.mockReset();
    s3Mock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    // reset registered flag by clearing module cache and re-importing
    vi.resetModules();
  });

  afterAll(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("dev: S3 probe failure should NOT throw (warn and continue)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    s3Mock.mockRejectedValue(
      new Error("S3 storage is not reachable: EAI_AGAIN"),
    );

    // Need to re-import after stubbing env and resetting module state
    vi.resetModules();
    // re-apply mocks after resetModules? vi.mock is hoisted so still mocked, but need to re-get register
    const { register } = await import("@/lib/instrumentation");

    await expect(register()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("production: S3 probe failure should NOT throw - degraded (warn + error, continue)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    s3Mock.mockRejectedValue(
      new Error("S3 storage is not reachable: EAI_AGAIN"),
    );

    vi.resetModules();
    const { register } = await import("@/lib/instrumentation");

    await expect(register()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("dev: S3 probe success should resolve silently", async () => {
    vi.stubEnv("NODE_ENV", "development");
    s3Mock.mockResolvedValue(undefined);

    vi.resetModules();
    const { register } = await import("@/lib/instrumentation");

    await expect(register()).resolves.toBeUndefined();
  });
});

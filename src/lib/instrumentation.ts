let registered = false;

// One-time server startup: validate production configuration and artifact
// storage. Invoked from the server entry.
// Idempotent so repeated imports do not re-run it.
export async function register() {
  if (registered) {
    return;
  }
  registered = true;

  const [
    { assertProductionConfigReady },
    { assertProjectArtifactStorageReady },
    { assertProvidersForProduction },
  ] = await Promise.all([
    import("@/lib/config/production-config"),
    import("@/lib/projects/artifact-storage-readiness"),
    import("@/lib/ai/provider-startup-check"),
  ]);

  assertProductionConfigReady();
  try {
    await assertProjectArtifactStorageReady();
  } catch (error) {
    console.warn(
      "[storage] S3 not reachable - artifact features degraded until infra is up:",
      error instanceof Error ? error.message : error,
    );
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[storage] S3 check failed in production — continuing degraded:",
        error instanceof Error ? error.message : error,
      );
    }
  }
  assertProvidersForProduction();

  // Fire-and-forget: don't block boot on MinIO being slow to come up — the
  // first upload surfaces the real error if bucket init failed.
  void import("@/scripts/init-s3-buckets")
    .then(({ ensureS3Buckets }) => ensureS3Buckets())
    .catch((error) => {
      console.warn(
        "[storage] S3 bucket init skipped/failed:",
        error instanceof Error ? error.message : error,
      );
    });

  const { primeSettingCache } = await import("@/lib/config/app-settings");
  await primeSettingCache();

  try {
    const { startAttemptQueueWorker } =
      await import("@/lib/projects/attempt-queue");
    startAttemptQueueWorker();
  } catch (error) {
    console.warn(
      "[attempt-queue] worker failed to start - queue degraded until Redis is up:",
      error instanceof Error ? error.message : error,
    );
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[attempt-queue] worker failed in production — continuing degraded:",
        error instanceof Error ? error.message : error,
      );
    }
  }
}

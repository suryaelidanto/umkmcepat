let registered = false;

// One-time server startup: validate production configuration and artifact
// storage, then warm OpenRouter pricing. Invoked from the server entry.
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
    import("@/lib/production-config"),
    import("@/lib/projects/artifact-storage-readiness"),
    import("@/lib/provider-startup-check"),
  ]);

  assertProductionConfigReady();
  try {
    await assertProjectArtifactStorageReady();
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw error;
    }
    console.warn(
      "[storage] S3 not reachable - artifact features degraded until infra is up:",
      error instanceof Error ? error.message : error,
    );
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

  // Warm OpenRouter pricing cache + schedule 24h refresh (non-blocking).
  const { startModelPricingRefresh } = await import("@/lib/model-pricing");
  startModelPricingRefresh();

  const { primeSettingCache } = await import("@/lib/app-settings");
  await primeSettingCache();

  try {
    const { startAttemptQueueWorker } =
      await import("@/lib/projects/attempt-queue");
    startAttemptQueueWorker();
  } catch (error) {
    console.error(
      "[attempt-queue] worker failed to start:",
      error instanceof Error ? error.message : error,
    );
    throw error;
  }
}

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
  await assertProjectArtifactStorageReady();
  assertProvidersForProduction();

  // Warm OpenRouter pricing cache + schedule 24h refresh (non-blocking).
  const { startModelPricingRefresh } = await import("@/lib/model-pricing");
  startModelPricingRefresh();
}

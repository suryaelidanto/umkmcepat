let registered = false;

// One-time server startup: validate production configuration and artifact
// storage, then load AI observability (Langfuse OpenTelemetry). Invoked from
// the server entry. Idempotent so repeated imports do not re-run it.
export async function register() {
  if (registered) {
    return;
  }
  registered = true;

  const [
    { assertProductionConfigReady },
    { assertProjectArtifactStorageReady },
  ] = await Promise.all([
    import("@/lib/production-config"),
    import("@/lib/projects/artifact-storage-readiness"),
  ]);

  assertProductionConfigReady();
  await assertProjectArtifactStorageReady();
  await import("@/lib/ai-observability");
}

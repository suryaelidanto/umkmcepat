export async function register() {
  if (
    process.env.NEXT_RUNTIME === "edge" ||
    process.env.NEXT_PHASE === "phase-production-build"
  ) {
    return;
  }

  const [
    { assertProductionConfigReady },
    { assertProjectArtifactStorageReady },
  ] = await Promise.all([
    import("./src/lib/production-config"),
    import("./src/lib/projects/artifact-storage-readiness"),
  ]);

  assertProductionConfigReady();
  await assertProjectArtifactStorageReady();
  await import("./src/lib/ai-observability");
}

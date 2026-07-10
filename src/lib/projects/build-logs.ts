const MAX_SAFE_BUILD_LOG_LENGTH = 12_000;

export type BuildFailureReason =
  | "artifact_write_failure"
  | "blocked_package"
  | "compile_error"
  | "manifest_failure"
  | "stale_worker"
  | "timeout"
  | "unknown";

export function sanitizeBuildLog(value: string) {
  return value
    .replace(
      /([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*=)[^\s]+/gi,
      "$1[redacted]",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .slice(0, MAX_SAFE_BUILD_LOG_LENGTH);
}

export function classifyBuildFailure(log: string): BuildFailureReason {
  const value = log.toLowerCase();

  if (value.includes("generated app manifest failed preflight")) {
    return "manifest_failure";
  }

  if (
    value.includes("generated app package policy failed preflight") ||
    value.includes("generated app build policy failed preflight")
  ) {
    return "blocked_package";
  }

  if (value.includes("build timed out") || value.includes("timed out")) {
    return "timeout";
  }

  if (value.includes("artifact") && value.includes("failed")) {
    return "artifact_write_failure";
  }

  if (value.includes("stale") || value.includes("worker crash")) {
    return "stale_worker";
  }

  if (
    value.includes("error:") ||
    value.includes("failed to compile") ||
    value.includes("syntaxerror") ||
    value.includes("type error")
  ) {
    return "compile_error";
  }

  return "unknown";
}

export function getIndonesianBuildFailureSummary(reason: BuildFailureReason) {
  const summaries: Record<BuildFailureReason, string> = {
    artifact_write_failure:
      "Build selesai, tapi file hasil website belum bisa disimpan. Coba ulangi.",
    blocked_package:
      "Build ditolak karena website mencoba memakai paket yang belum didukung.",
    compile_error:
      "Build gagal karena kode website belum valid. Coba minta edit yang lebih sederhana atau build ulang.",
    manifest_failure: "Build ditolak karena kontrak website belum lengkap.",
    stale_worker: "Build terhenti terlalu lama. Coba jalankan ulang.",
    timeout: "Build terlalu lama dan dihentikan. Coba sederhanakan permintaan.",
    unknown: "Build belum berhasil. Coba ulangi atau ubah instruksi.",
  };

  return summaries[reason];
}

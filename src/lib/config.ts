import {
  formatProviderOptions,
  getDefaultProvider,
  getProviderEnvName,
  isProviderValue,
  type ProviderCapability,
  type ProviderValue,
} from "./provider-registry";

import { getSettingSync } from "@/lib/app-settings";

export function getEnv(name: string, fallback = ""): string {
  return process.env[name] || fallback;
}

export function isGeneratedBuildExecutionEnabled() {
  return getCapabilityFlag("feature.generated_build_execution");
}

export function isGeneratedPublicExecutionEnabled() {
  return getCapabilityFlag("feature.generated_public_execution");
}

function getCapabilityFlag(key: string) {
  // ponytail: getSettingSync constrains T to boolean|number|string (no undefined).
  // Cast to read the cold-cache signal; ceiling = widen AppSetting T to allow undefined.
  const readSync = getSettingSync as unknown as (
    k: string,
    f: undefined,
  ) => boolean | undefined;
  const dbValue = readSync(key, undefined);
  if (typeof dbValue === "boolean") {
    return dbValue;
  }
  // env-fallback semantics (preserves old behavior): unset → dev-true/prod-false.
  const envName =
    key === "feature.generated_build_execution"
      ? "GENERATED_BUILD_EXECUTION_ENABLED"
      : "GENERATED_PUBLIC_EXECUTION_ENABLED";
  const raw = getEnv(envName).trim().toLowerCase();
  if (!raw) {
    return process.env.NODE_ENV !== "production";
  }
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  throw new Error(`${envName} must be true or false.`);
}

export function getConfiguredProvider<T extends ProviderCapability>(
  capability: T,
): ProviderValue<T> {
  const envName = getProviderEnvName(capability);
  const rawValue = getEnv(
    envName,
    getDefaultProvider(capability),
  ).toLowerCase();

  if (!isProviderValue(capability, rawValue)) {
    throw new Error(
      `Invalid ${envName} '${rawValue}'. Supported values: ${formatProviderOptions(capability)}.`,
    );
  }

  return rawValue;
}

import {
  formatProviderOptions,
  getDefaultProvider,
  getProviderEnvName,
  isProviderValue,
  type ProviderCapability,
  type ProviderValue,
} from "./provider-registry";

export function getEnv(name: string, fallback = ""): string {
  return process.env[name] || fallback;
}

export function isGeneratedBuildExecutionEnabled() {
  return getCapabilityFlag("GENERATED_BUILD_EXECUTION_ENABLED");
}

export function isGeneratedPublicExecutionEnabled() {
  return getCapabilityFlag("GENERATED_PUBLIC_EXECUTION_ENABLED");
}

export function isDiscussOneCallToolsEnabled() {
  return getCapabilityFlag("DISCUSS_ONE_CALL_TOOLS");
}

function getCapabilityFlag(name: string) {
  const raw = getEnv(name).trim().toLowerCase();

  if (!raw) {
    return process.env.NODE_ENV !== "production";
  }

  if (raw === "true") {
    return true;
  }

  if (raw === "false") {
    return false;
  }

  throw new Error(`${name} must be true or false.`);
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

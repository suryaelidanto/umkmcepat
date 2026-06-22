import {
  formatProviderOptions,
  getDefaultProvider,
  getProviderEnvName,
  isProviderValue,
  type ProviderCapability,
  type ProviderValue,
} from "@/lib/provider-registry";

type RequiredEnvOptions = {
  feature: string;
};

export function requireEnv(name: string, options: RequiredEnvOptions): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${options.feature} is not configured. Missing ${name}.`);
  }

  return value;
}

export function getEnv(name: string, fallback = ""): string {
  return process.env[name] || fallback;
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

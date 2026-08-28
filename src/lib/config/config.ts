import {
  formatProviderOptions,
  getDefaultProvider,
  getProviderEnvName,
  isProviderValue,
  type ProviderCapability,
  type ProviderValue,
} from "@/lib/ai/provider-registry";
import { getSetting } from "@/lib/config/app-settings";

export function getEnv(name: string, fallback = ""): string {
  if (typeof process !== "undefined" && process.env?.[name]) {
    return process.env[name];
  }
  if (typeof window !== "undefined") {
    const win = window as unknown as {
      __PUBLIC_CONFIG__?: Record<string, string>;
      ENV?: Record<string, string>;
    };
    if (win.__PUBLIC_CONFIG__?.[name]) {
      return win.__PUBLIC_CONFIG__[name];
    }
    if (win.ENV?.[name]) {
      return win.ENV[name];
    }
  }
  if (typeof import.meta !== "undefined" && import.meta.env?.[name]) {
    return (import.meta.env[name] as string) || fallback;
  }
  return fallback;
}

export function isGeneratedBuildExecutionEnabled() {
  const raw =
    process.env.GENERATED_BUILD_EXECUTION_ENABLED?.trim().toLowerCase();
  if (raw === "false") {
    return false;
  }
  return true;
}

export function isGeneratedPublicExecutionEnabled() {
  const raw =
    process.env.GENERATED_PUBLIC_EXECUTION_ENABLED?.trim().toLowerCase();
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  return process.env.NODE_ENV !== "production";
}

export function isStreamerModeEnabled(): Promise<boolean> {
  return getSetting("feature.streamer_mode", true);
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

export const PROVIDER_REGISTRY = {
  ai: {
    env: "AI_PROVIDER",
    default: "9router",
    values: ["9router", "openai", "anthropic", "gemini"],
  },
  rateLimit: {
    env: "RATE_LIMIT_PROVIDER",
    default: "memory",
    values: ["memory", "redis", "none"],
  },
} as const;

export type ProviderCapability = keyof typeof PROVIDER_REGISTRY;
export type ProviderValue<T extends ProviderCapability> =
  (typeof PROVIDER_REGISTRY)[T]["values"][number];

export function getProviderOptions<T extends ProviderCapability>(
  capability: T,
): readonly ProviderValue<T>[] {
  return PROVIDER_REGISTRY[capability].values as readonly ProviderValue<T>[];
}

export function getProviderEnvName(capability: ProviderCapability): string {
  return PROVIDER_REGISTRY[capability].env;
}

export function getDefaultProvider<T extends ProviderCapability>(
  capability: T,
): ProviderValue<T> {
  return PROVIDER_REGISTRY[capability].default as ProviderValue<T>;
}

export function isProviderValue<T extends ProviderCapability>(
  capability: T,
  value: string,
): value is ProviderValue<T> {
  return (PROVIDER_REGISTRY[capability].values as readonly string[]).includes(
    value,
  );
}

export function formatProviderOptions(capability: ProviderCapability): string {
  return PROVIDER_REGISTRY[capability].values.join(", ");
}

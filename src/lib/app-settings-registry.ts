export type SettingType = "boolean" | "number" | "string";
export type SettingTier = "basic" | "advanced";
export type SettingCategory =
  | "feature_flag"
  | "economics"
  | "booster"
  | "ai"
  | "rate_limit"
  | "runtime"
  | "limits";

// Render order on /admin/settings. Basic categories render expanded; advanced
// collapse behind a single disclosure.
export const CATEGORY_ORDER = [
  "feature_flag",
  "economics",
  "booster",
  "ai",
  "rate_limit",
  "runtime",
  "limits",
] as const satisfies readonly SettingCategory[];

export const CATEGORY_TIER: Record<SettingCategory, SettingTier> = {
  feature_flag: "basic",
  economics: "basic",
  booster: "basic",
  ai: "advanced",
  rate_limit: "advanced",
  runtime: "advanced",
  limits: "advanced",
};

export type ConfigEntry = {
  key: string;
  category: SettingCategory;
  type: SettingType;
  label: string;
  fallback: boolean | number | string;
  tier: SettingTier;
  // Canonical env var name. Omitted when the setting has no env equivalent.
  // This is the single source of truth for key→env mapping; nothing derives
  // an env name by string transformation.
  env?: string;
  // Inclusive bounds, numbers only. Enforced on write by the admin PUT handler
  // and mirrored by the consumer's own read-side clamp.
  min?: number;
  max?: number;
  // True when the value is read once at process start, so a change needs a
  // restart to take effect. Surfaced as a badge in the admin UI.
  requiresRestart?: boolean;
};

// Source of truth for DB-overridable, non-secret config. Adding a setting
// later = one entry here; it auto-appears in the admin Settings UI. Secrets
// (API keys, credentials) NEVER appear here — they stay in .env.
export const APP_SETTINGS: ConfigEntry[] = [
  // feature_flag
  {
    key: "feature.waitlist_enabled",
    category: "feature_flag",
    tier: "basic",
    type: "boolean",
    label: "Waitlist onboarding gate",
    fallback: true,
  },
  {
    key: "feature.generated_build_execution",
    category: "feature_flag",
    tier: "basic",
    type: "boolean",
    label: "Generated build execution",
    fallback: false,
  },
  {
    key: "feature.generated_public_execution",
    category: "feature_flag",
    tier: "basic",
    type: "boolean",
    label: "Generated public execution",
    fallback: false,
  },
  {
    key: "feature.streamer_mode",
    category: "feature_flag",
    tier: "basic",
    type: "boolean",
    label: "Streamer mode (mask PII in admin)",
    fallback: true,
  },
  // booster (fallbacks mirror BOOSTER_PACKS in pakasir.ts)
  {
    key: "booster.pocket.amount",
    category: "booster",
    tier: "basic",
    type: "number",
    label: "Pocket — amount (Rp)",
    fallback: 2900,
  },
  {
    key: "booster.pocket.energy",
    category: "booster",
    tier: "basic",
    type: "number",
    label: "Pocket — energy",
    fallback: 50000,
  },
  {
    key: "booster.starter.amount",
    category: "booster",
    tier: "basic",
    type: "number",
    label: "Starter — amount (Rp)",
    fallback: 8900,
  },
  {
    key: "booster.starter.energy",
    category: "booster",
    tier: "basic",
    type: "number",
    label: "Starter — energy",
    fallback: 200000,
  },
  {
    key: "booster.popular.amount",
    category: "booster",
    tier: "basic",
    type: "number",
    label: "Popular — amount (Rp)",
    fallback: 24900,
  },
  {
    key: "booster.popular.energy",
    category: "booster",
    tier: "basic",
    type: "number",
    label: "Popular — energy",
    fallback: 600000,
  },
  {
    key: "booster.max.amount",
    category: "booster",
    tier: "basic",
    type: "number",
    label: "Max — amount (Rp)",
    fallback: 59900,
  },
  {
    key: "booster.max.energy",
    category: "booster",
    tier: "basic",
    type: "number",
    label: "Max — energy",
    fallback: 1500000,
  },
  // rate_limit (fallbacks mirror rate-limit.ts defaults)
  {
    key: "ratelimit.global_ip.requests",
    category: "rate_limit",
    tier: "advanced",
    type: "number",
    label: "Global IP — requests",
    fallback: 300,
  },
  {
    key: "ratelimit.global_ip.window_seconds",
    category: "rate_limit",
    tier: "advanced",
    type: "number",
    label: "Global IP — window (s)",
    fallback: 60,
  },
  {
    key: "ratelimit.ai_user.requests",
    category: "rate_limit",
    tier: "advanced",
    type: "number",
    label: "AI user — requests",
    fallback: 60,
  },
  {
    key: "ratelimit.ai_user.window_seconds",
    category: "rate_limit",
    tier: "advanced",
    type: "number",
    label: "AI user — window (s)",
    fallback: 600,
  },
  {
    key: "ratelimit.ai_ip.requests",
    category: "rate_limit",
    tier: "advanced",
    type: "number",
    label: "AI IP — requests",
    fallback: 20,
  },
  {
    key: "ratelimit.ai_ip.window_seconds",
    category: "rate_limit",
    tier: "advanced",
    type: "number",
    label: "AI IP — window (s)",
    fallback: 600,
  },
  {
    key: "ratelimit.build_user.requests",
    category: "rate_limit",
    tier: "advanced",
    type: "number",
    label: "Build user — requests",
    fallback: 10,
  },
  {
    key: "ratelimit.build_user.window_seconds",
    category: "rate_limit",
    tier: "advanced",
    type: "number",
    label: "Build user — window (s)",
    fallback: 3600,
  },
  {
    key: "ratelimit.build_ip.requests",
    category: "rate_limit",
    tier: "advanced",
    type: "number",
    label: "Build IP — requests",
    fallback: 5,
  },
  {
    key: "ratelimit.build_ip.window_seconds",
    category: "rate_limit",
    tier: "advanced",
    type: "number",
    label: "Build IP — window (s)",
    fallback: 3600,
  },
  // ai (optional — tunable live)
  {
    key: "ai.timeout.moderation_ms",
    category: "ai",
    tier: "advanced",
    type: "number",
    label: "AI — moderation timeout (ms)",
    fallback: 30000,
  },
  {
    key: "ai.timeout.discuss_ms",
    category: "ai",
    tier: "advanced",
    type: "number",
    label: "AI — discuss timeout (ms)",
    fallback: 90000,
  },
  {
    key: "ai.models_default",
    category: "ai",
    tier: "advanced",
    type: "string",
    label: "AI — default model id",
    fallback: "umkmcepat-combo",
  },
];

export function findConfigEntry(key: string): ConfigEntry | undefined {
  return APP_SETTINGS.find((e) => e.key === key);
}

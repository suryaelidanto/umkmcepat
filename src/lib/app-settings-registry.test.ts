import { describe, expect, it } from "vitest";

import {
  APP_SETTINGS,
  CATEGORY_ORDER,
  CATEGORY_TIER,
} from "@/lib/app-settings-registry";

describe("APP_SETTINGS registry", () => {
  it("has no duplicate keys", () => {
    const keys = APP_SETTINGS.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every entry has a non-empty label and valid type", () => {
    for (const entry of APP_SETTINGS) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(["boolean", "number", "string"]).toContain(entry.type);
    }
  });

  it("every category is one of the known set", () => {
    for (const entry of APP_SETTINGS) {
      expect(CATEGORY_ORDER).toContain(entry.category);
    }
  });

  it("includes the waitlist flag with fail-safe default true", () => {
    const e = APP_SETTINGS.find((x) => x.key === "feature.waitlist_enabled");
    expect(e).toBeDefined();
    expect(e?.type).toBe("boolean");
    expect(e?.fallback).toBe(true);
  });

  it("includes all four booster packs with amount+energy", () => {
    for (const id of ["pocket", "starter", "popular", "max"]) {
      expect(
        APP_SETTINGS.find((x) => x.key === `booster.${id}.amount`),
      ).toBeDefined();
      expect(
        APP_SETTINGS.find((x) => x.key === `booster.${id}.energy`),
      ).toBeDefined();
    }
  });
});

describe("registry schema", () => {
  it("every entry declares a valid tier", () => {
    for (const entry of APP_SETTINGS) {
      expect(["basic", "advanced"]).toContain(entry.tier);
    }
  });

  it("every entry's tier matches its category tier (advanced overrides ok)", () => {
    for (const entry of APP_SETTINGS) {
      if (
        entry.tier === "advanced" &&
        CATEGORY_TIER[entry.category] === "basic"
      ) {
        // Per-entry demotion into Konfigurasi lanjutan (e.g. thumbnail capture).
        continue;
      }
      expect(entry.tier).toBe(CATEGORY_TIER[entry.category]);
    }
  });

  it("CATEGORY_ORDER covers every category used by an entry", () => {
    for (const entry of APP_SETTINGS) {
      expect(CATEGORY_ORDER).toContain(entry.category);
    }
  });

  it("no two entries share an env var name", () => {
    const envs = APP_SETTINGS.map((e) => e.env).filter(Boolean);
    expect(new Set(envs).size).toBe(envs.length);
  });

  it("numeric bounds are coherent: min <= fallback <= max", () => {
    for (const entry of APP_SETTINGS) {
      if (entry.type !== "number") {
        continue;
      }
      if (entry.min !== undefined) {
        expect(entry.fallback).toBeGreaterThanOrEqual(entry.min);
      }
      if (entry.max !== undefined) {
        expect(entry.fallback).toBeLessThanOrEqual(entry.max);
      }
      if (entry.min !== undefined && entry.max !== undefined) {
        expect(entry.min).toBeLessThanOrEqual(entry.max);
      }
    }
  });
});

describe("existing entries carry env + bounds", () => {
  it("maps waitlist feature flag to its env var", () => {
    expect(
      APP_SETTINGS.find((e) => e.key === "feature.waitlist_enabled")?.env,
    ).toBe("WAITLIST_ENABLED");
  });

  it("maps every rate_limit key to its RATE_LIMIT_* env var", () => {
    const rateLimits = APP_SETTINGS.filter((e) => e.category === "rate_limit");
    expect(rateLimits).toHaveLength(10);
    for (const entry of rateLimits) {
      expect(entry.env).toMatch(/^RATE_LIMIT_[A-Z_]+$/);
    }
  });

  it("maps ai.models_default to AI_MODELS", () => {
    expect(APP_SETTINGS.find((e) => e.key === "ai.models_default")?.env).toBe(
      "AI_MODELS",
    );
  });

  it("maps ai.model.moderation to AI_MODEL_MODERATION", () => {
    expect(APP_SETTINGS.find((e) => e.key === "ai.model.moderation")?.env).toBe(
      "AI_MODEL_MODERATION",
    );
  });

  it("maps ai.model.discuss to AI_MODEL_DISCUSS", () => {
    expect(APP_SETTINGS.find((e) => e.key === "ai.model.discuss")?.env).toBe(
      "AI_MODEL_DISCUSS",
    );
  });

  it("maps ai.model.build to AI_MODEL_BUILD", () => {
    expect(APP_SETTINGS.find((e) => e.key === "ai.model.build")?.env).toBe(
      "AI_MODEL_BUILD",
    );
  });

  it("marks four model keys with nine_router_models optionsSource", () => {
    for (const key of [
      "ai.models_default",
      "ai.model.moderation",
      "ai.model.discuss",
      "ai.model.build",
    ]) {
      expect(APP_SETTINGS.find((e) => e.key === key)?.optionsSource).toBe(
        "nine_router_models",
      );
    }
  });

  it("streamer_mode has no env var (DB-only)", () => {
    expect(
      APP_SETTINGS.find((e) => e.key === "feature.streamer_mode")?.env,
    ).toBeUndefined();
  });

  it("includes the contract-compiled rollout flag defaulting off", () => {
    const e = APP_SETTINGS.find(
      (x) => x.key === "generation.contract_compiled_rollout",
    );
    expect(e).toBeDefined();
    expect(e?.type).toBe("string");
    expect(e?.fallback).toBe("off");
    expect(e?.enumOptions).toEqual(["off", "internal", "pilot", "all"]);
  });

  it("includes the contract admission flag defaulting paused", () => {
    const e = APP_SETTINGS.find(
      (x) => x.key === "generation.contract_admission",
    );
    expect(e).toBeDefined();
    expect(e?.fallback).toBe("paused");
    expect(e?.enumOptions).toEqual(["paused", "enabled"]);
  });

  it("every numeric entry declares min and max", () => {
    for (const entry of APP_SETTINGS) {
      if (entry.type === "number") {
        expect(entry.min).toBeDefined();
        expect(entry.max).toBeDefined();
      }
    }
  });
});

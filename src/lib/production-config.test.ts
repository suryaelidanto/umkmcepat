import { afterEach, describe, expect, it, vi } from "vitest";

import { assertProductionConfigReady } from "@/lib/production-config";

const validProductionEnv = {
  DATABASE_URL:
    "postgresql://umkm:strong-password@postgres:5432/umkmcepat?schema=public",
  GENERATED_BUILD_EXECUTION_ENABLED: "false",
  GENERATED_PUBLIC_EXECUTION_ENABLED: "false",
  NEXTAUTH_SECRET: "a-strong-auth-secret-with-at-least-32-characters",
  NEXTAUTH_URL: "https://umkmcepat.example",
  NEXT_PUBLIC_APP_URL: "https://umkmcepat.example",
  PROJECT_ARTIFACT_DIR: "/app/.data/project-artifacts",
  PROJECT_ARTIFACT_STORAGE_PROVIDER: "local",
  PROJECT_RUNTIME_SUPERVISOR: "noop",
};

describe("production config preflight", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts an explicit contained production configuration", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const [name, value] of Object.entries(validProductionEnv)) {
      vi.stubEnv(name, value);
    }

    expect(() => assertProductionConfigReady()).not.toThrow();
  });

  it("rejects placeholders, insecure URLs, weak database credentials, and local runtime authority", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const [name, value] of Object.entries(validProductionEnv)) {
      vi.stubEnv(name, value);
    }

    vi.stubEnv("NEXTAUTH_SECRET", "replace-with-strong-secret");
    expect(() => assertProductionConfigReady()).toThrow(
      "NEXTAUTH_SECRET must be a strong non-placeholder secret",
    );

    vi.stubEnv("NEXTAUTH_SECRET", validProductionEnv.NEXTAUTH_SECRET);
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    expect(() => assertProductionConfigReady()).toThrow(
      "NEXTAUTH_URL must use HTTPS in production.",
    );

    vi.stubEnv("NEXTAUTH_URL", validProductionEnv.NEXTAUTH_URL);
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://postgres:postgres@postgres:5432/umkmcepat",
    );
    expect(() => assertProductionConfigReady()).toThrow(
      "DATABASE_URL uses default or placeholder PostgreSQL credentials.",
    );

    vi.stubEnv(
      "DATABASE_URL",
      "postgresql-unsafe://umkm:strong-password@postgres:5432/umkmcepat",
    );
    expect(() => assertProductionConfigReady()).toThrow(
      "DATABASE_URL must use PostgreSQL.",
    );

    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://umkm:change-me@postgres:5432/umkmcepat",
    );
    expect(() => assertProductionConfigReady()).toThrow(
      "DATABASE_URL uses default or placeholder PostgreSQL credentials.",
    );

    vi.stubEnv("DATABASE_URL", validProductionEnv.DATABASE_URL);
    vi.stubEnv("PROJECT_ARTIFACT_DIR", "/app/.data/ephemeral-artifacts");
    expect(() => assertProductionConfigReady()).toThrow(
      "PROJECT_ARTIFACT_DIR must match the persistent production volume",
    );

    vi.stubEnv("PROJECT_ARTIFACT_DIR", validProductionEnv.PROJECT_ARTIFACT_DIR);
    vi.stubEnv("PROJECT_RUNTIME_SUPERVISOR", "local");
    expect(() => assertProductionConfigReady()).toThrow(
      "PROJECT_RUNTIME_SUPERVISOR must be noop until isolated runtime authority is configured.",
    );
  });

  it("does nothing outside production", () => {
    vi.stubEnv("NODE_ENV", "test");

    expect(() => assertProductionConfigReady()).not.toThrow();
  });
});

import {
  getEnv,
  isGeneratedBuildExecutionEnabled,
  isGeneratedPublicExecutionEnabled,
} from "@/lib/config";
import { getGeneratedPublicUrl } from "@/lib/generated-public-origin";

export function assertProductionConfigReady() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const appUrl = assertHttpsUrl("NEXT_PUBLIC_APP_URL");
  const authUrl = assertHttpsUrl("NEXTAUTH_URL");

  if (appUrl.origin !== authUrl.origin) {
    throw new Error(
      "NEXTAUTH_URL and NEXT_PUBLIC_APP_URL must use the same production origin.",
    );
  }

  assertStrongSecret("NEXTAUTH_SECRET");
  assertRequiredSecret("OTP_SPACE_API_KEY");
  assertDatabaseUrl();
  assertArtifactStoragePath();

  if (isGeneratedBuildExecutionEnabled()) {
    throw new Error(
      "Generated build execution cannot be enabled until an isolated production executor is configured.",
    );
  }

  if (isGeneratedPublicExecutionEnabled()) {
    getGeneratedPublicUrl("production-preflight");
  }

  if (getEnv("PROJECT_RUNTIME_SUPERVISOR", "noop") !== "noop") {
    throw new Error(
      "PROJECT_RUNTIME_SUPERVISOR must be noop until isolated runtime authority is configured.",
    );
  }
}

function assertHttpsUrl(name: string) {
  const value = getEnv(name);
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute production URL.`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS in production.`);
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error(
      `${name} cannot include credentials, a path, query, or fragment.`,
    );
  }

  return url;
}

function assertStrongSecret(name: string) {
  const value = getEnv(name);

  if (value.length < 32 || /replace|change-?me|example|secret$/i.test(value)) {
    throw new Error(
      `${name} must be a strong non-placeholder secret with at least 32 characters.`,
    );
  }
}

function assertRequiredSecret(name: string) {
  if (!getEnv(name).trim()) {
    throw new Error(`${name} must be configured in production.`);
  }
}

function assertDatabaseUrl() {
  const value = getEnv("DATABASE_URL");
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use PostgreSQL.");
  }

  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const placeholder = /^(?:postgres|password|change-?me|example|replace.*)$/i;

  if (
    !username ||
    !password ||
    placeholder.test(username) ||
    placeholder.test(password)
  ) {
    throw new Error(
      "DATABASE_URL uses default or placeholder PostgreSQL credentials.",
    );
  }
}

function assertArtifactStoragePath() {
  if (getEnv("PROJECT_ARTIFACT_STORAGE_PROVIDER", "local") !== "local") {
    return;
  }

  if (
    getEnv("PROJECT_ARTIFACT_DIR", "/app/.data/project-artifacts") !==
    "/app/.data/project-artifacts"
  ) {
    throw new Error(
      "PROJECT_ARTIFACT_DIR must match the persistent production volume at /app/.data/project-artifacts.",
    );
  }
}

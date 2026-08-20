// Asserts provider keys are set in production. Missing key -> boot fails
const REQUIRED_IN_PRODUCTION = ["RESEND_API_KEY"] as const;

export function assertProvidersForProduction(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }
  const missing = REQUIRED_IN_PRODUCTION.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(
      `Production requires these provider keys: ${missing.join(", ")}. Set them or mock mode stays off in prod.`,
    );
  }
}

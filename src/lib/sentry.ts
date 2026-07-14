import * as Sentry from "@sentry/tanstackstart-react";

// Sentry is only active in production with a DSN configured — identical gating
// to the previous @sentry/nextjs setup (production && SENTRY_DSN).
export function initSentry() {
  const dsn = import.meta.env.PROD
    ? (import.meta.env.VITE_SENTRY_DSN ??
      (typeof process !== "undefined" ? process.env?.SENTRY_DSN : undefined))
    : undefined;

  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    tracesSampleRate: 1,
    sendDefaultPii: false,
  });
}

export { Sentry };

// Umami event tracking. Dev-off (no events sent) + prod-on; never on /api/*
// server routes or /p/<slug> published sites (those are the user's, not the
// platform's to instrument). Empty NEXT_PUBLIC_UMAMI_WEBSITE_ID = no-op.
export function track(
  event: string,
  props?: Record<string, string | number | boolean>,
): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }
  if (typeof window === "undefined") {
    return;
  }
  if (!process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID) {
    return;
  }
  const w = window as unknown as {
    umami?: { track?: (e: string, p?: unknown) => void };
  };
  w.umami?.track?.(event, props);
}

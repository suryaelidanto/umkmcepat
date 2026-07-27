// Umami event tracking. Fires whenever NEXT_PUBLIC_UMAMI_WEBSITE_ID is set
// (dev or prod); never on /api/* server routes or /p/<slug> published sites
// (those are the user's, not the platform's to instrument).
// ponytail: ceiling = single env sink; upgrade path = per-env writeKey when
// you need separate dev/prod Umami instances. For now point dev .env at a
// local Umami container, prod .env at the prod instance — no cross-pollution.
export function track(
  event: string,
  props?: Record<string, string | number | boolean>,
): void {
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

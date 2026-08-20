// Umami event tracking. Fires whenever NEXT_PUBLIC_UMAMI_WEBSITE_ID is set
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

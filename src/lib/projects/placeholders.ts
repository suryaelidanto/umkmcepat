export type PlaceholderKind = "landscape" | "portrait";

const TRANSPARENT_1PX =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export const LANDSCAPE_PLACEHOLDER_SVG = TRANSPARENT_1PX;
export const PORTRAIT_PLACEHOLDER_SVG = TRANSPARENT_1PX;

export const PLACEHOLDER_DATA_URIS: Record<PlaceholderKind, string> = {
  landscape: TRANSPARENT_1PX,
  portrait: TRANSPARENT_1PX,
};

export function pickPlaceholderDataUri(
  _width: number,
  _height: number,
): string {
  return TRANSPARENT_1PX;
}

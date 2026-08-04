export type PlaceholderKind = "landscape" | "portrait";

const LANDSCAPE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" role="img" aria-labelledby="title description">
  <title id="title">Tidak ada foto</title>
  <desc id="description">Tempat untuk foto yang akan ditambahkan pemilik usaha</desc>
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#f5f1ea" />
      <stop offset="1" stop-color="#e4ddd2" />
    </linearGradient>
  </defs>
  <rect width="600" height="400" fill="url(#background)" />
  <circle cx="300" cy="170" r="42" fill="none" stroke="#8c8174" stroke-width="3" />
  <path d="m274 181 17-18 15 14 12-10 18 14" fill="none" stroke="#8c8174" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
  <text x="300" y="250" fill="#655c52" font-family="system-ui, sans-serif" font-size="20" font-weight="600" text-anchor="middle">Tidak ada foto</text>
</svg>`;

const PORTRAIT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" role="img" aria-labelledby="title description">
  <title id="title">Tidak ada foto</title>
  <desc id="description">Tempat untuk foto yang akan ditambahkan pemilik usaha</desc>
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#f5f1ea" />
      <stop offset="1" stop-color="#e4ddd2" />
    </linearGradient>
  </defs>
  <rect width="400" height="600" fill="url(#background)" />
  <circle cx="200" cy="230" r="48" fill="none" stroke="#8c8174" stroke-width="3" />
  <path d="m170 244 19-21 17 16 14-12 20 16" fill="none" stroke="#8c8174" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
  <text x="200" y="330" fill="#655c52" font-family="system-ui, sans-serif" font-size="22" font-weight="600" text-anchor="middle">Tidak ada foto</text>
</svg>`;

export const LANDSCAPE_PLACEHOLDER_SVG = LANDSCAPE_SVG;
export const PORTRAIT_PLACEHOLDER_SVG = PORTRAIT_SVG;

export const PLACEHOLDER_DATA_URIS: Record<PlaceholderKind, string> = {
  landscape: `data:image/svg+xml;base64,${Buffer.from(LANDSCAPE_SVG).toString(
    "base64",
  )}`,
  portrait: `data:image/svg+xml;base64,${Buffer.from(PORTRAIT_SVG).toString(
    "base64",
  )}`,
};

export function pickPlaceholderDataUri(width: number, height: number): string {
  return height > width
    ? PLACEHOLDER_DATA_URIS.portrait
    : PLACEHOLDER_DATA_URIS.landscape;
}

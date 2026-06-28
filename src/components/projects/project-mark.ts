export type ProjectMark = {
  base: string;
  from: string;
  to: string;
  angle: number;
  glowColor: string;
  glowX: number;
  glowY: number;
};

// Warm-neutral dark bases keep marks aligned with the product chrome.
const MARK_BASES = ["#201f1d", "#23221f", "#1d1e1c"];
// Brand aurora palette (matches --chart-1..5 in globals.css).
const AURORA = ["#ff7a59", "#ee4f9b", "#7867ff", "#2f8cff", "#f7a441"];

// Deterministic branded mesh-gradient mark. Continuous angle + glow position
// give each project a unique, memorable composition without random slop.
export function createProjectMark(seed: string): ProjectMark {
  const hash = hashSeed(seed);
  const base = MARK_BASES[hash % MARK_BASES.length];
  // Pick 3 distinct aurora colors by removing each choice from a shrinking pool.
  const pool = [...AURORA];
  const from = pool.splice((hash >> 2) % pool.length, 1)[0];
  const to = pool.splice((hash >> 7) % pool.length, 1)[0];
  const glowColor = pool.splice((hash >> 11) % pool.length, 1)[0];

  return {
    base,
    from,
    to,
    glowColor,
    angle: hash % 360,
    glowX: 14 + ((hash >> 13) % 72),
    glowY: 14 + ((hash >> 19) % 72),
  };
}

function hashSeed(seed: string) {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

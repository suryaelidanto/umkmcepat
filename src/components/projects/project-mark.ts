export type ProjectMarkShape = {
  color: string;
  kind: "circle" | "rect";
  size: number;
  x: number;
  y: number;
  radius: number;
  rotate: number;
  opacity: number;
};

export type ProjectMark = {
  background: string;
  shapes: ProjectMarkShape[];
};

const PROJECT_MARK_BACKGROUNDS = ["#23231f", "#282823", "#1f211f"];
const PROJECT_MARK_COLORS = ["#fcfbf8", "#c8c0b2", "#7a746b", "#3b3933"];

export function createProjectMark(seed: string): ProjectMark {
  const hash = hashSeed(seed);
  const background =
    PROJECT_MARK_BACKGROUNDS[hash % PROJECT_MARK_BACKGROUNDS.length];

  return {
    background,
    shapes: [0, 1, 2].map((index) => {
      const value = hashSeed(`${seed}:${index}`);
      const size = 150 + (value % 190);

      return {
        color: PROJECT_MARK_COLORS[(value >> 3) % PROJECT_MARK_COLORS.length],
        kind: (value >> 5) % 3 === 0 ? "circle" : "rect",
        size,
        x: -40 + ((value >> 8) % 500),
        y: -48 + ((value >> 14) % 310),
        radius: [28, 72, 999][(value >> 20) % 3],
        rotate: ((value >> 24) % 42) - 21,
        opacity: [0.18, 0.34, 0.58][index],
      };
    }),
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

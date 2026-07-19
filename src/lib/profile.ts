export function normalizeProfileName(value: unknown) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, 100)
    : "";
}

export function getDiceBearAvatarUrl(name: string): string {
  const seed = name.trim() || "default";
  return `https://api.dicebear.com/9.x/lorelei/svg?seed=${encodeURIComponent(seed)}`;
}

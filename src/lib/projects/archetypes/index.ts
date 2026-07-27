import indexDoc from "./_index.md?raw";
import genericFallback from "./generic-fallback.md?raw";

export const ARCHETYPE_IDS: string[] = ["generic", "fnb-menu"];

const GUIDE_BY_ID: Record<string, string> = {
  generic: genericFallback,
};

const INDEX_DOC: string = indexDoc;

export function loadArchetypeGuide(id: string): string {
  const normalized = typeof id === "string" ? id.trim().toLowerCase() : "";
  return GUIDE_BY_ID[normalized] ?? genericFallback;
}

export function loadArchetypeIndex(): string {
  return INDEX_DOC;
}

import indexDoc from "./_index.md?raw";
import educationCourse from "./education-course.md?raw";
import fnbLight from "./fnb-light.md?raw";
import fnbMenu from "./fnb-menu.md?raw";
import genericFallback from "./generic-fallback.md?raw";
import professionalCredibility from "./professional-credibility.md?raw";
import retailCatalog from "./retail-catalog.md?raw";
import retailGrocery from "./retail-grocery.md?raw";
import serviceAppointment from "./service-appointment.md?raw";
import serviceArea from "./service-area.md?raw";
import serviceOnline from "./service-online.md?raw";

/**
 * Every valid archetype id, independent of whether its guide `.md` exists yet.
 * The implementation-spec parser validates against THIS list — an id is valid
 * even before its guide doc is authored (business archetypes land in T6).
 * `loadArchetypeGuide` falls back to `generic-fallback.md` for ids without a doc.
 */
export const KNOWN_ARCHETYPE_IDS: string[] = [
  "fnb-menu",
  "fnb-light",
  "retail-catalog",
  "retail-grocery",
  "service-area",
  "service-appointment",
  "service-online",
  "education-course",
  "professional-credibility",
  "community-group",
  "event-promo",
  "property-rental",
  "health-beauty",
  "creative-portfolio",
  "agri-produce",
  "generic",
];

/**
 * Backward-compat alias. Prefer `KNOWN_ARCHETYPE_IDS` for the allow-list;
 * this is kept so existing imports (and the loader self-check test) keep working.
 */
export { KNOWN_ARCHETYPE_IDS as ARCHETYPE_IDS };

const GUIDE_BY_ID: Record<string, string> = {
  generic: genericFallback,
  "fnb-menu": fnbMenu,
  "fnb-light": fnbLight,
  "retail-catalog": retailCatalog,
  "retail-grocery": retailGrocery,
  "service-area": serviceArea,
  "service-appointment": serviceAppointment,
  "service-online": serviceOnline,
  "education-course": educationCourse,
  "professional-credibility": professionalCredibility,
};

const INDEX_DOC: string = indexDoc;

export function loadArchetypeGuide(id: string): string {
  const normalized = typeof id === "string" ? id.trim().toLowerCase() : "";
  return GUIDE_BY_ID[normalized] ?? genericFallback;
}

export function loadArchetypeIndex(): string {
  return INDEX_DOC;
}

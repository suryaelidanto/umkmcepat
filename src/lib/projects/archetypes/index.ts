import indexDoc from "./_index.md?raw";
import agriProduce from "./agri-produce.md?raw";
import communityGroup from "./community-group.md?raw";
import creativePortfolio from "./creative-portfolio.md?raw";
import educationCourse from "./education-course.md?raw";
import eventPromo from "./event-promo.md?raw";
import fnbLight from "./fnb-light.md?raw";
import fnbMenu from "./fnb-menu.md?raw";
import genericFallback from "./generic-fallback.md?raw";
import healthBeauty from "./health-beauty.md?raw";
import professionalCredibility from "./professional-credibility.md?raw";
import propertyRental from "./property-rental.md?raw";
import retailCatalog from "./retail-catalog.md?raw";
import retailGrocery from "./retail-grocery.md?raw";
import serviceAppointment from "./service-appointment.md?raw";
import serviceArea from "./service-area.md?raw";
import serviceOnline from "./service-online.md?raw";

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
  "community-group": communityGroup,
  "event-promo": eventPromo,
  "property-rental": propertyRental,
  "health-beauty": healthBeauty,
  "creative-portfolio": creativePortfolio,
  "agri-produce": agriProduce,
};

const INDEX_DOC: string = indexDoc;

export function loadArchetypeGuide(id: string): string {
  const normalized = typeof id === "string" ? id.trim().toLowerCase() : "";
  return GUIDE_BY_ID[normalized] ?? genericFallback;
}

export function loadArchetypeIndex(): string {
  return INDEX_DOC;
}

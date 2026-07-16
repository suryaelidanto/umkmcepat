// src/lib/projects/build-handoff.ts
import type { ProjectBrief } from "@/lib/projects/brief";

const TRAILING = " — sisanya bisa lo tambahin nanti.";

function primaryName(brief: ProjectBrief): string | null {
  if (!brief.productOrService || brief.productOrService.length === 0) {
    return null;
  }
  const primary = brief.productOrService.find((p) => p.isPrimary);
  return (primary ?? brief.productOrService[0]).name;
}

function contactLabel(brief: ProjectBrief): string | null {
  if (!brief.contact) {
    return null;
  }
  switch (brief.contact.channel) {
    case "whatsapp":
      return `WA ${brief.contact.value}`;
    case "phone":
      return `telp ${brief.contact.value}`;
    case "instagram":
      return `IG ${brief.contact.value}`;
    case "maps":
      return `Maps ${brief.contact.value}`;
    case "other":
      return brief.contact.value;
  }
}

export function buildHandoffLine(brief: ProjectBrief): string {
  const parts: string[] = ["oke, gw bangun dengan"];
  if (brief.businessName) {
    parts.push(brief.businessName);
  }
  const product = primaryName(brief);
  if (product) {
    parts.push(product);
  }
  const contact = contactLabel(brief);
  if (contact) {
    parts.push(contact);
  }
  return `${parts.join(", ")}${TRAILING}`;
}

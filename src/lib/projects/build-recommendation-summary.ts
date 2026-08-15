import type { BuildContractV1 } from "./build-contract";
import type { BuildPlanV1 } from "./build-plan";

/**
 * What the owner reads before pressing "Mulai buat website". Derived from the
 * frozen contract and plan the build actually consumes, so the card can never
 * promise something different from what ships.
 *
 * Written for a shop owner, not an engineer: no business-type codes, no
 * confidence scores, no field counts, and nothing about detail they never gave.
 */
const MAX_LISTED_OFFERS = 3;

export function describeBuildRecommendation(
  contract: BuildContractV1,
  plan: BuildPlanV1,
): string[] {
  const lines: string[] = [];
  const offers = offerNames(contract);
  if (offers.length > 0) {
    lines.push(
      offers.length > MAX_LISTED_OFFERS
        ? `Menampilkan ${offers.length} pilihan`
        : `Menampilkan: ${offers.join(", ")}`,
    );
  }
  if (hasPricing(contract)) {
    lines.push("Harga ikut ditampilkan");
  }
  const cta = primaryCtaLabel(contract);
  if (cta) {
    lines.push(`Pengunjung diarahkan ke ${cta}`);
  }
  const extras = supportingDetail(contract);
  if (extras.length > 0) {
    lines.push(`Ikut tampil: ${extras.join(", ")}`);
  }
  const pageCount = plan.pages?.length ?? 0;
  if (pageCount > 1) {
    lines.push(`${pageCount} halaman`);
  }
  const direction = visualDirection(contract);
  if (direction) {
    lines.push(`Gaya: ${direction}`);
  }
  return lines;
}

function offerFacts(contract: BuildContractV1): Array<Record<string, unknown>> {
  return contract.facts
    .filter((fact) => fact.kind === "offer")
    .flatMap((fact) => (Array.isArray(fact.value) ? fact.value : [fact.value]))
    .filter(isRecord);
}

function offerNames(contract: BuildContractV1): string[] {
  return offerFacts(contract)
    .map((offer) => (typeof offer.name === "string" ? offer.name.trim() : ""))
    .filter(Boolean);
}

function hasPricing(contract: BuildContractV1): boolean {
  return offerFacts(contract).some(
    (offer) =>
      typeof offer.priceRange === "string" &&
      offer.priceRange.trim().length > 0,
  );
}

const CHANNEL_NAMES: Record<string, string> = {
  whatsapp: "WhatsApp",
  phone: "telepon",
  instagram: "Instagram",
  maps: "Google Maps",
};

/**
 * The stored intent label can be as vague as "Chat". Naming the channel says
 * where customers actually land, whatever wording the model chose.
 */
function primaryCtaLabel(contract: BuildContractV1): string {
  const intent = contract.ctaIntents?.[0];
  const channel = intent?.kind ? CHANNEL_NAMES[intent.kind] : undefined;
  if (channel) {
    return channel;
  }
  const label = intent?.label?.trim();
  if (label) {
    return label;
  }
  const contact = contract.facts.find((fact) => fact.kind === "contact")?.value;
  return isRecord(contact) && typeof contact.label === "string"
    ? contact.label.trim()
    : "";
}

const SUPPORTING_LABELS: ReadonlyArray<
  [BuildContractV1["facts"][number]["kind"], string]
> = [
  ["hours", "jam buka"],
  ["address", "alamat"],
  ["payment_method", "cara pembayaran"],
  ["service_area", "area pengiriman"],
];

function supportingDetail(contract: BuildContractV1): string[] {
  const kinds = new Set(contract.facts.map((fact) => fact.kind));
  return SUPPORTING_LABELS.filter(([kind]) => kinds.has(kind)).map(
    ([, label]) => label,
  );
}

function visualDirection(contract: BuildContractV1): string {
  const preferences = contract.preferences as
    { visualDirection?: unknown } | undefined;
  return typeof preferences?.visualDirection === "string"
    ? preferences.visualDirection.trim()
    : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// PROTOTYPE — Efferd-inspired admin shells B–E. A = current production.
// Question: which dashboard chrome fits /admin/*?

export const ADMIN_VARIANTS = ["A", "B", "C", "D", "E"] as const;
export type AdminVariant = (typeof ADMIN_VARIANTS)[number];

export const VARIANT_LABELS: Record<AdminVariant, string> = {
  A: "Current",
  B: "Efferd dense KPI",
  C: "App shell sidebar",
  D: "Chart + tables",
  E: "Ops command",
};

export function parseAdminVariant(raw: unknown): AdminVariant {
  if (typeof raw === "string" && ADMIN_VARIANTS.includes(raw as AdminVariant)) {
    return raw as AdminVariant;
  }
  return "A";
}

export function withVariant(path: string, variant: AdminVariant): string {
  if (variant === "A") {
    return path;
  }
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}variant=${variant}`;
}

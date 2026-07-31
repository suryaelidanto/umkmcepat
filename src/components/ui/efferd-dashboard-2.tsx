// PROTOTYPE entry — Efferd dashboard-2 adapted for UMKM Cepat admin.
// Not production. Used under /admin?variant=B|C|D|E overview only.

import type { AdminVariant } from "@/components/admin/prototype/types";

import {
  EfferdDashboard,
  type OverviewData,
} from "@/components/admin/prototype/efferd/dashboard";

export function EfferdDashboard2({
  variant,
  data,
}: {
  variant: Exclude<AdminVariant, "A">;
  data: OverviewData | undefined;
}) {
  return <EfferdDashboard data={data} variant={variant} />;
}

export default EfferdDashboard2;

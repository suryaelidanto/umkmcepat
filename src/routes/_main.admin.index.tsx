import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import {
  AdminOverviewDashboard,
  type OverviewData,
} from "@/components/admin/AdminOverviewDashboard";
import { fetchJson } from "@/lib/query-client";

export const Route = createFileRoute("/_main/admin/")({
  component: OverviewPage,
});

function OverviewPage() {
  const { data } = useQuery({
    queryFn: () => fetchJson<OverviewData>("/api/admin/overview"),
    queryKey: ["admin", "overview"],
  });

  return <AdminOverviewDashboard data={data} />;
}

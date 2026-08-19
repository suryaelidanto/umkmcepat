import { useQuery } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";

import {
  AdminOverviewDashboard,
  type OverviewData,
} from "@/components/admin/overview/AdminOverviewDashboard";
import {
  ADMIN_SUMMARY_POLL_MS,
  fetchJson,
  queryKeys,
} from "@/lib/query-client";

export const Route = createLazyFileRoute("/_main/admin/")({
  component: OverviewPage,
});

function OverviewPage() {
  const { data } = useQuery({
    queryFn: () => fetchJson<OverviewData>("/api/admin/overview"),
    queryKey: queryKeys.adminOverview,
    refetchInterval: ADMIN_SUMMARY_POLL_MS,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  return <AdminOverviewDashboard data={data} />;
}

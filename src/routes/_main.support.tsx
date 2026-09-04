import { createFileRoute } from "@tanstack/react-router";

import { SupportDashboard } from "@/components/support/SupportDashboard";

export const Route = createFileRoute("/_main/support")({
  component: SupportDashboard,
});

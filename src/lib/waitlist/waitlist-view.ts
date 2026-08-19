export type WaitlistView = "approval" | "success" | "form";

export function resolveWaitlistView(input: {
  effectiveStatus: string | null | undefined;
  ownStatus: string | null | undefined;
  submitted: boolean;
}): WaitlistView {
  if (input.effectiveStatus === "approved") {
    return "approval";
  }
  if (input.ownStatus === "rejected") {
    return "form";
  }
  if (
    input.submitted ||
    input.ownStatus === "pending" ||
    input.ownStatus === "waitlisted"
  ) {
    return "success";
  }
  return "form";
}

export type HomeAccessState =
  "approved" | "error" | "guest" | "loading" | "waitlisted";

type AuthStatus = "authenticated" | "loading" | "unauthenticated";

export function resolveHomeAccessState(input: {
  authStatus: AuthStatus;
  hasUser: boolean;
  hasWaitlistData: boolean;
  isApproved: boolean;
  waitlistStatus: "error" | "pending" | "success";
}): HomeAccessState {
  if (input.authStatus === "unauthenticated") {
    return "guest";
  }
  if (input.authStatus !== "authenticated" || !input.hasUser) {
    return input.hasUser ? "loading" : "guest";
  }
  if (input.waitlistStatus === "error" && !input.hasWaitlistData) {
    return "error";
  }
  if (!input.hasWaitlistData) {
    return "loading";
  }
  return input.isApproved ? "approved" : "waitlisted";
}

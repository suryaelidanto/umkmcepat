export function isGeneratedSiteQualityEnabled(input: {
  rollout: string;
  admin: boolean;
  waitlistApproved: boolean;
}): boolean {
  switch (input.rollout) {
    case "off":
      return false;
    case "internal":
      return input.admin;
    case "pilot":
      return input.admin || input.waitlistApproved;
    case "all":
      return true;
    default:
      return false;
  }
}

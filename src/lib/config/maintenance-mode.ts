import { getSetting } from "@/lib/config/app-settings";
import { isAdminEmail } from "@/lib/waitlist/waitlist";

const DEFAULT_MAINTENANCE_MESSAGE =
  "Sistem sedang dalam pemeliharaan berkala untuk peningkatan server. Semua data website Anda tetap aman.";

export async function isMaintenanceMode(): Promise<boolean> {
  const enabled = await getSetting("feature.maintenance_mode", false);
  return Boolean(enabled);
}

export async function getMaintenanceMessage(): Promise<string> {
  const msg = await getSetting(
    "feature.maintenance_message",
    DEFAULT_MAINTENANCE_MESSAGE,
  );
  if (typeof msg === "string" && msg.trim()) {
    return msg.trim();
  }
  return DEFAULT_MAINTENANCE_MESSAGE;
}

export async function checkMaintenanceGate(userEmail?: string | null): Promise<
  | { allowed: true }
  | {
      allowed: false;
      message: string;
      response: Response;
    }
> {
  const enabled = await isMaintenanceMode();
  if (!enabled) {
    return { allowed: true };
  }

  if (userEmail && isAdminEmail(userEmail)) {
    return { allowed: true };
  }

  const message = await getMaintenanceMessage();
  return {
    allowed: false,
    message,
    response: Response.json(
      {
        code: "maintenance_mode",
        message,
      },
      {
        status: 503,
        headers: {
          "Retry-After": "60",
        },
      },
    ),
  };
}

export type AdminStatusTone = "success" | "pending" | "danger" | "neutral";

export type AdminStatusDisplay = {
  tone: AdminStatusTone;
  label: string;
};

export function waitlistStatusDisplay(status: string): AdminStatusDisplay {
  switch (status) {
    case "pending":
    case "waitlisted":
      return { tone: "pending", label: "Menunggu" };
    case "approved":
      return { tone: "success", label: "Disetujui" };
    case "rejected":
      return { tone: "danger", label: "Ditolak" };
    default:
      return { tone: "neutral", label: status };
  }
}

export function paymentStatusDisplay(status: string): AdminStatusDisplay {
  switch (status) {
    case "COMPLETED":
      return { tone: "success", label: "Selesai" };
    case "PENDING":
      return { tone: "pending", label: "Menunggu" };
    case "FAILED":
      return { tone: "danger", label: "Gagal" };
    default:
      return { tone: "neutral", label: status };
  }
}

export function projectStatusTone(value: string): AdminStatusTone {
  const v = value.toLowerCase();
  if (
    v.includes("fail") ||
    v.includes("error") ||
    v === "canceled" ||
    v === "cancelled" ||
    v === "stale"
  ) {
    return "danger";
  }
  if (v === "ready" || v === "passed" || v === "succeeded") {
    return "success";
  }
  if (
    v === "running" ||
    v === "building" ||
    v === "generating" ||
    v === "editing" ||
    v === "repairing" ||
    v === "queued" ||
    v === "starting"
  ) {
    return "pending";
  }
  return "neutral";
}

export function ticketStatusDisplay(status: string): AdminStatusDisplay {
  switch (status) {
    case "OPEN":
      return { tone: "pending", label: "Buka" };
    case "RESOLVED":
      return { tone: "neutral", label: "Selesai" };
    default:
      return { tone: "neutral", label: status };
  }
}

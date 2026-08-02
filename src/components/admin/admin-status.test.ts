import { describe, expect, it } from "vitest";

import {
  paymentStatusDisplay,
  projectStatusTone,
  ticketStatusDisplay,
  userFlagsDisplay,
  waitlistStatusDisplay,
} from "./admin-status";

describe("waitlistStatusDisplay", () => {
  it("maps pending and waitlisted to Menunggu/pending", () => {
    expect(waitlistStatusDisplay("pending")).toEqual({
      tone: "pending",
      label: "Menunggu",
    });
    expect(waitlistStatusDisplay("waitlisted")).toEqual({
      tone: "pending",
      label: "Menunggu",
    });
  });

  it("maps approved and rejected", () => {
    expect(waitlistStatusDisplay("approved")).toEqual({
      tone: "success",
      label: "Disetujui",
    });
    expect(waitlistStatusDisplay("rejected")).toEqual({
      tone: "danger",
      label: "Ditolak",
    });
  });

  it("falls back to raw neutral", () => {
    expect(waitlistStatusDisplay("weird")).toEqual({
      tone: "neutral",
      label: "weird",
    });
  });
});

describe("paymentStatusDisplay", () => {
  it("maps COMPLETED PENDING FAILED", () => {
    expect(paymentStatusDisplay("COMPLETED")).toEqual({
      tone: "success",
      label: "Selesai",
    });
    expect(paymentStatusDisplay("PENDING")).toEqual({
      tone: "pending",
      label: "Menunggu",
    });
    expect(paymentStatusDisplay("FAILED")).toEqual({
      tone: "danger",
      label: "Gagal",
    });
  });
});

describe("projectStatusTone", () => {
  it("classifies fail/progress/success/neutral", () => {
    expect(projectStatusTone("failed")).toBe("danger");
    expect(projectStatusTone("build_error")).toBe("danger");
    expect(projectStatusTone("canceled")).toBe("danger");
    expect(projectStatusTone("stale")).toBe("danger");
    expect(projectStatusTone("succeeded")).toBe("success");
    expect(projectStatusTone("ready")).toBe("success");
    expect(projectStatusTone("running")).toBe("pending");
    expect(projectStatusTone("queued")).toBe("pending");
    expect(projectStatusTone("draft")).toBe("neutral");
  });
});

describe("ticketStatusDisplay", () => {
  it("maps OPEN and RESOLVED", () => {
    expect(ticketStatusDisplay("OPEN")).toEqual({
      tone: "pending",
      label: "Buka",
    });
    expect(ticketStatusDisplay("RESOLVED")).toEqual({
      tone: "neutral",
      label: "Selesai",
    });
  });
});

describe("userFlagsDisplay", () => {
  it("returns verified and optional banned badges", () => {
    expect(userFlagsDisplay({ verified: true, banned: false })).toEqual([
      { tone: "success", label: "Terverifikasi" },
    ]);
    expect(userFlagsDisplay({ verified: false, banned: true })).toEqual([
      { tone: "neutral", label: "Belum verifikasi" },
      { tone: "danger", label: "Diblokir" },
    ]);
  });
});

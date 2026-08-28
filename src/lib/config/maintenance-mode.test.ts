import { describe, expect, it, vi } from "vitest";

import { checkMaintenanceGate, isMaintenanceMode } from "./maintenance-mode";

vi.mock("@/lib/config/app-settings", () => ({
  getSetting: vi.fn(async (key: string) => {
    if (key === "feature.maintenance_mode") {
      return true;
    }
    if (key === "feature.maintenance_message") {
      return "Sedang perbaikan server.";
    }
    return null;
  }),
}));

vi.mock("@/lib/waitlist/waitlist", () => ({
  isAdminEmail: vi.fn((email: string) => email === "admin@umkmcepat.com"),
}));

describe("maintenance mode gate", () => {
  it("detects maintenance mode is enabled", async () => {
    expect(await isMaintenanceMode()).toBe(true);
  });

  it("blocks non-admin users with 503 response", async () => {
    const result = await checkMaintenanceGate("user@example.com");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.message).toBe("Sedang perbaikan server.");
      expect(result.response.status).toBe(503);
    }
  });

  it("allows admin users to bypass maintenance mode", async () => {
    const result = await checkMaintenanceGate("admin@umkmcepat.com");
    expect(result.allowed).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  approveWaitlistEntryMock,
  findUniqueMock,
  rejectWaitlistEntryMock,
  requireAdminMock,
  sendAcceptedMock,
  sendRejectedMock,
} = vi.hoisted(() => ({
  approveWaitlistEntryMock: vi.fn(),
  findUniqueMock: vi.fn(),
  rejectWaitlistEntryMock: vi.fn(),
  requireAdminMock: vi.fn(),
  sendAcceptedMock: vi.fn(),
  sendRejectedMock: vi.fn(),
}));

vi.mock("@/lib/auth-admin", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/email/templates", () => ({
  sendWaitlistAccepted: sendAcceptedMock,
  sendWaitlistRejected: sendRejectedMock,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { waitlistEntry: { findUnique: findUniqueMock } },
}));
vi.mock("@/lib/waitlist", () => ({
  approveWaitlistEntry: approveWaitlistEntryMock,
  listPendingWaitlist: vi.fn(),
  rejectWaitlistEntry: rejectWaitlistEntryMock,
}));

import { getHandler } from "../../tests/support/route-handler";

import { Route } from "@/routes/api.admin.waitlist";

const POST = getHandler(
  Route as never as Parameters<typeof getHandler>[0],
  "POST",
);

describe("admin waitlist decisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({
      ok: true,
      admin: { userId: "admin-1" },
    });
    approveWaitlistEntryMock.mockResolvedValue(undefined);
    rejectWaitlistEntryMock.mockResolvedValue(undefined);
    findUniqueMock.mockResolvedValue({
      businessName: "Toko Budi",
      email: "budi@example.com",
    });
    sendAcceptedMock.mockResolvedValue(undefined);
    sendRejectedMock.mockResolvedValue(undefined);
  });

  it("approves through the protected service and returns approved", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/waitlist", {
        method: "POST",
        body: JSON.stringify({ action: "approve", entryId: "entry-1" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "approved" });
    expect(approveWaitlistEntryMock).toHaveBeenCalledWith("entry-1", "admin-1");
  });

  it("rejects through the protected service and returns rejected", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/waitlist", {
        method: "POST",
        body: JSON.stringify({
          action: "reject",
          entryId: "entry-1",
          reason: "Data belum cukup.",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "rejected" });
    expect(rejectWaitlistEntryMock).toHaveBeenCalledWith(
      "entry-1",
      "admin-1",
      "Data belum cukup.",
    );
  });
});

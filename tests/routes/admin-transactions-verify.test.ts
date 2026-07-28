import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminMock,
  getMayarTransactionMock,
  prismaPaymentFindUniqueMock,
  prismaPaymentUpdateMock,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  getMayarTransactionMock: vi.fn(),
  prismaPaymentFindUniqueMock: vi.fn(),
  prismaPaymentUpdateMock: vi.fn(),
}));

vi.mock("@/lib/auth-admin", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/mayar", () => ({
  getMayarTransaction: getMayarTransactionMock,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: {
      findUnique: prismaPaymentFindUniqueMock,
      update: prismaPaymentUpdateMock,
    },
  },
}));

import { getHandler } from "./_handler";

import { Route } from "@/routes/api.admin.transactions.$orderId.verify";

const POST = getHandler(Route, "POST");

describe("POST /api/admin/transactions/$orderId/verify", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    requireAdminMock.mockResolvedValue({ ok: true });
    getMayarTransactionMock.mockReset();
    prismaPaymentFindUniqueMock.mockReset();
    prismaPaymentUpdateMock.mockReset();
  });

  it("rejects non-admins", async () => {
    requireAdminMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      message: "Forbidden.",
    });

    const res = await POST(undefined, { orderId: "INV-1" });
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown orderId", async () => {
    prismaPaymentFindUniqueMock.mockResolvedValueOnce(null);

    const res = await POST(undefined, { orderId: "INV-missing" });
    expect(res.status).toBe(404);
  });

  it("short-circuits non-PENDING payments without calling Mayar", async () => {
    prismaPaymentFindUniqueMock.mockResolvedValueOnce({
      amount: 2900,
      status: "COMPLETED",
      providerTxnId: "txn-1",
    });

    const res = await POST(undefined, { orderId: "INV-1" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("COMPLETED");
    expect(getMayarTransactionMock).not.toHaveBeenCalled();
  });

  it("returns a clear error for legacy Pakasir rows with no providerTxnId", async () => {
    prismaPaymentFindUniqueMock.mockResolvedValueOnce({
      amount: 2900,
      status: "PENDING",
      providerTxnId: null,
    });

    const res = await POST(undefined, { orderId: "INV-legacy" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toContain("pre-migration");
  });

  it("verifies via Mayar and updates status for a PENDING row", async () => {
    prismaPaymentFindUniqueMock.mockResolvedValueOnce({
      amount: 2900,
      status: "PENDING",
      providerTxnId: "txn-1",
    });
    getMayarTransactionMock.mockResolvedValueOnce({
      status: "paid",
      amount: 2900,
      paymentMethod: "QRIS",
    });

    const res = await POST(undefined, { orderId: "INV-1" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("PAID");
    expect(getMayarTransactionMock).toHaveBeenCalledWith("txn-1");
    expect(prismaPaymentUpdateMock).toHaveBeenCalledWith({
      where: { orderId: "INV-1" },
      data: { status: "PAID" },
    });
  });

  it("returns 502 when the Mayar verification call fails", async () => {
    prismaPaymentFindUniqueMock.mockResolvedValueOnce({
      amount: 2900,
      status: "PENDING",
      providerTxnId: "txn-1",
    });
    getMayarTransactionMock.mockRejectedValueOnce(new Error("network error"));

    const res = await POST(undefined, { orderId: "INV-1" });
    expect(res.status).toBe(502);
  });
});

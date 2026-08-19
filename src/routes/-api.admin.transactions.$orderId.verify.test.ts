import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminMock,
  getMayarTransactionMock,
  prismaPaymentFindUniqueMock,
  prismaPaymentUpdateManyMock,
  prismaTransactionMock,
  prismaExecuteRawMock,
  prismaUserFindUniqueMock,
  sendPaymentReceiptMock,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  getMayarTransactionMock: vi.fn(),
  prismaPaymentFindUniqueMock: vi.fn(),
  prismaPaymentUpdateManyMock: vi.fn(),
  prismaTransactionMock: vi.fn(),
  prismaExecuteRawMock: vi.fn(),
  prismaUserFindUniqueMock: vi.fn(),
  sendPaymentReceiptMock: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/auth-admin", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/payment/mayar", () => ({
  getMayarTransaction: getMayarTransactionMock,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: {
      findUnique: prismaPaymentFindUniqueMock,
      updateMany: prismaPaymentUpdateManyMock,
    },
    user: {
      findUnique: prismaUserFindUniqueMock,
    },
    $transaction: prismaTransactionMock,
  },
}));
vi.mock("@/lib/email/templates", () => ({
  sendPaymentReceipt: sendPaymentReceiptMock,
}));

import { getHandler } from "../../tests/support/route-handler";

import { Route } from "@/routes/api.admin.transactions.$orderId.verify";

const POST = getHandler(Route, "POST");

describe("POST /api/admin/transactions/$orderId/verify", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    requireAdminMock.mockResolvedValue({ ok: true });
    getMayarTransactionMock.mockReset();
    prismaPaymentFindUniqueMock.mockReset();
    prismaPaymentUpdateManyMock.mockReset();
    prismaTransactionMock.mockReset();
    prismaExecuteRawMock.mockReset();
    prismaUserFindUniqueMock.mockReset();
    sendPaymentReceiptMock.mockReset();

    // Default: $transaction executes callback with a tx object that has
    // updateMany (returns count=1) and $executeRaw
    prismaTransactionMock.mockImplementation(
      async (cb: (tx: unknown) => unknown) => {
        return cb({
          payment: {
            updateMany: prismaPaymentUpdateManyMock,
          },
          $executeRaw: prismaExecuteRawMock,
        });
      },
    );
    prismaPaymentUpdateManyMock.mockResolvedValue({ count: 1 });
    prismaExecuteRawMock.mockResolvedValue(1);
    prismaUserFindUniqueMock.mockResolvedValue({ email: "user@example.com" });
    sendPaymentReceiptMock.mockResolvedValue(undefined);
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
      userId: "user-1",
      energyGranted: 50000,
      metadata: null,
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
      userId: "user-1",
      energyGranted: 50000,
      metadata: null,
    });

    const res = await POST(undefined, { orderId: "INV-legacy" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toContain("pre-migration");
  });

  it("verifies via Mayar, credits energy atomically, and returns COMPLETED for a paid row", async () => {
    prismaPaymentFindUniqueMock.mockResolvedValueOnce({
      amount: 2900,
      status: "PENDING",
      providerTxnId: "txn-1",
      userId: "user-1",
      energyGranted: 50000,
      metadata: { packageName: "Energy Starter" },
    });
    getMayarTransactionMock.mockResolvedValueOnce({
      status: "paid",
      amount: 2900,
      paymentMethod: "QRIS",
    });

    const res = await POST(undefined, { orderId: "INV-1" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.status).toBe("COMPLETED");
    expect(getMayarTransactionMock).toHaveBeenCalledWith("txn-1");

    // $transaction must have been called (atomic claim + credit)
    expect(prismaTransactionMock).toHaveBeenCalledOnce();

    // updateMany inside the transaction sets COMPLETED
    expect(prismaPaymentUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: "INV-1", status: "PENDING" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );

    // $executeRaw inside the transaction credits energy
    expect(prismaExecuteRawMock).toHaveBeenCalledOnce();

    // Email receipt sent with correct data
    expect(sendPaymentReceiptMock).toHaveBeenCalledWith(
      "user@example.com",
      expect.objectContaining({
        packageName: "Energy Starter",
        amount: 2900,
        energyGranted: 50000,
      }),
    );
  });

  it("returns success: false and Mayar status without DB write for non-paid statuses", async () => {
    prismaPaymentFindUniqueMock.mockResolvedValueOnce({
      amount: 2900,
      status: "PENDING",
      providerTxnId: "txn-1",
      userId: "user-1",
      energyGranted: 50000,
      metadata: null,
    });
    getMayarTransactionMock.mockResolvedValueOnce({
      status: "unpaid",
      amount: 2900,
      paymentMethod: null,
    });

    const res = await POST(undefined, { orderId: "INV-1" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.status).toBe("unpaid");
    expect(data.message).toContain("unpaid");

    // No DB writes for non-paid
    expect(prismaTransactionMock).not.toHaveBeenCalled();
    expect(prismaPaymentUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 502 when the Mayar verification call fails", async () => {
    prismaPaymentFindUniqueMock.mockResolvedValueOnce({
      amount: 2900,
      status: "PENDING",
      providerTxnId: "txn-1",
      userId: "user-1",
      energyGranted: 50000,
      metadata: null,
    });
    getMayarTransactionMock.mockRejectedValueOnce(new Error("network error"));

    const res = await POST(undefined, { orderId: "INV-1" });
    expect(res.status).toBe(502);
  });
});

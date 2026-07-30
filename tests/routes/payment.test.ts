import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  requireNotBannedMock,
  createMayarPaymentMock,
  getBoosterPackMock,
  getMayarTransactionMock,
  verifyMayarWebhookRequestMock,
  prismaPaymentCreateMock,
  prismaPaymentFindUniqueMock,
  prismaPaymentUpdateMock,
  prismaPaymentUpdateManyMock,
  prismaPaymentFindUniqueOrThrowMock,
  prismaUserFindUniqueMock,
  prismaUserFindUniqueOrThrowMock,
  prismaExecuteRawMock,
  prismaTransactionMock,
  sendPaymentReceiptMock,
} = vi.hoisted(() => ({
  authMock: vi.fn<() => Promise<unknown>>(async () => null),
  requireNotBannedMock: vi.fn(async () => undefined),
  createMayarPaymentMock: vi.fn(),
  getBoosterPackMock: vi.fn(),
  getMayarTransactionMock: vi.fn(),
  verifyMayarWebhookRequestMock: vi.fn(() => true),
  prismaPaymentCreateMock: vi.fn(),
  prismaPaymentFindUniqueMock: vi.fn(),
  prismaPaymentUpdateMock: vi.fn(),
  prismaPaymentUpdateManyMock: vi.fn(async () => ({ count: 1 })),
  prismaPaymentFindUniqueOrThrowMock: vi.fn(),
  prismaUserFindUniqueMock: vi.fn(async () => ({
    email: "user@example.com",
  })),
  prismaUserFindUniqueOrThrowMock: vi.fn(async () => ({
    name: "Test User",
    email: "test@example.com",
    phone: "081234567890",
  })),
  prismaExecuteRawMock: vi.fn(async () => 1),
  sendPaymentReceiptMock: vi.fn(async () => undefined),
  prismaTransactionMock: vi.fn(async (callback) =>
    callback({
      payment: {
        findUnique: prismaPaymentFindUniqueMock,
        findUniqueOrThrow: prismaPaymentFindUniqueOrThrowMock,
        update: prismaPaymentUpdateMock,
        updateMany: prismaPaymentUpdateManyMock,
      },
      $executeRaw: prismaExecuteRawMock,
    }),
  ),
}));

vi.mock("@/lib/auth", () => ({
  auth: authMock,
  requireNotBanned: requireNotBannedMock,
}));
vi.mock("@/lib/mayar", () => ({
  createMayarPayment: createMayarPaymentMock,
  getBoosterPack: getBoosterPackMock,
  getMayarTransaction: getMayarTransactionMock,
  verifyMayarWebhookRequest: verifyMayarWebhookRequestMock,
  BOOSTER_PACKS: {
    pocket: { amount: 2900, energy: 50000, name: "Pocket Booster" },
    starter: { amount: 8900, energy: 200000, name: "Starter Booster" },
    popular: { amount: 24900, energy: 600000, name: "Popular Booster" },
    max: { amount: 59900, energy: 1500000, name: "Max Booster" },
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: prismaTransactionMock,
    payment: {
      create: prismaPaymentCreateMock,
      findUnique: prismaPaymentFindUniqueMock,
      findUniqueOrThrow: prismaPaymentFindUniqueOrThrowMock,
      update: prismaPaymentUpdateMock,
      updateMany: prismaPaymentUpdateManyMock,
    },
    user: {
      findUnique: prismaUserFindUniqueMock,
      findUniqueOrThrow: prismaUserFindUniqueOrThrowMock,
    },
  },
}));
vi.mock("@/lib/email/templates", () => ({
  sendPaymentReceipt: sendPaymentReceiptMock,
}));

import { getHandler } from "./_handler";

import { Route as CreateRoute } from "@/routes/api.payment.create";
import { Route as StatusRoute } from "@/routes/api.payment.status.$orderId";
import { Route as WebhookRoute } from "@/routes/api.payment.webhook";

const POST_CREATE = getHandler(CreateRoute, "POST");
const POST_WEBHOOK = getHandler(WebhookRoute, "POST");
const GET_STATUS = getHandler(StatusRoute, "GET");

describe("Payment API Routes", () => {
  beforeEach(() => {
    authMock.mockReset();
    createMayarPaymentMock.mockReset();
    getBoosterPackMock.mockReset();
    getBoosterPackMock.mockImplementation((id: string) => {
      const packs = {
        pocket: { amount: 2900, energy: 50000, name: "Pocket Booster" },
        starter: { amount: 8900, energy: 200000, name: "Starter Booster" },
        popular: { amount: 24900, energy: 600000, name: "Popular Booster" },
        max: { amount: 59900, energy: 1500000, name: "Max Booster" },
      } as const;
      return Promise.resolve((packs as Record<string, unknown>)[id] ?? null);
    });
    getMayarTransactionMock.mockReset();
    verifyMayarWebhookRequestMock.mockReset();
    verifyMayarWebhookRequestMock.mockReturnValue(true);
    prismaPaymentCreateMock.mockReset();
    prismaPaymentFindUniqueMock.mockReset();
    prismaPaymentFindUniqueOrThrowMock.mockReset();
    prismaPaymentUpdateMock.mockReset();
    prismaPaymentUpdateManyMock.mockReset();
    prismaPaymentUpdateManyMock.mockImplementation(async () => ({ count: 1 }));
    prismaUserFindUniqueOrThrowMock.mockReset();
    prismaUserFindUniqueOrThrowMock.mockResolvedValue({
      name: "Test User",
      email: "test@example.com",
      phone: "081234567890",
    });
    prismaExecuteRawMock.mockClear();
    prismaTransactionMock.mockClear();
    sendPaymentReceiptMock.mockClear();
  });

  describe("POST /api/payment/create", () => {
    it("requires authentication", async () => {
      authMock.mockResolvedValueOnce(null);

      const res = await POST_CREATE(
        new Request("http://localhost/api/payment/create", {
          method: "POST",
          body: JSON.stringify({ packageId: "pocket" }),
        }),
      );

      expect(res.status).toBe(401);
    });

    it("rejects banned users before creating a Mayar invoice", async () => {
      authMock.mockResolvedValueOnce({
        user: { id: "user_1" },
        expires: new Date().toISOString(),
      });
      requireNotBannedMock.mockImplementationOnce(() => {
        throw new Response(null, {
          status: 307,
          headers: { Location: "/blocked" },
        });
      });

      try {
        await POST_CREATE(
          new Request("http://localhost/api/payment/create", {
            method: "POST",
            body: JSON.stringify({ packageId: "pocket" }),
          }),
        );
      } catch {
        // Test harness may or may not propagate the throw depending on how
        // the Response is returned. Either way, the side effects must not
        // have happened.
      }

      expect(createMayarPaymentMock).not.toHaveBeenCalled();
      expect(prismaPaymentCreateMock).not.toHaveBeenCalled();
    });

    it("rejects invalid packageId", async () => {
      authMock.mockResolvedValueOnce({
        user: { id: "user_1" },
        expires: new Date().toISOString(),
      });

      const res = await POST_CREATE(
        new Request("http://localhost/api/payment/create", {
          method: "POST",
          body: JSON.stringify({ packageId: "unknown-package" }),
        }),
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toContain("Invalid package");
    });

    it("successfully creates a payment session via Mayar", async () => {
      authMock.mockResolvedValueOnce({
        user: { id: "user_1" },
        expires: new Date().toISOString(),
      });

      createMayarPaymentMock.mockResolvedValueOnce({
        id: "req-1",
        transactionId: "txn-1",
        link: "https://testingmayar.myr.id/pl/abc",
      });

      prismaPaymentCreateMock.mockResolvedValueOnce({
        orderId: "INV-USER1-12345",
        amount: 2900,
        energyGranted: 50000,
        status: "PENDING",
        paymentUrl: "https://testingmayar.myr.id/pl/abc",
      });

      const res = await POST_CREATE(
        new Request("http://localhost/api/payment/create", {
          method: "POST",
          body: JSON.stringify({ packageId: "pocket" }),
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.orderId).toBe("INV-USER1-12345");
      expect(data.paymentUrl).toBe("https://testingmayar.myr.id/pl/abc");
      expect(createMayarPaymentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: expect.stringMatching(/^INV-/),
          amount: 2900,
          packName: "Pocket Booster",
          expiredAt: expect.any(String),
          customerName: "Test User",
          customerEmail: "test@example.com",
          customerMobile: "081234567890",
        }),
      );
      expect(prismaPaymentCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user_1",
            amount: 2900,
            energyGranted: 50000,
            status: "PENDING",
            providerTxnId: "txn-1",
            providerPaymentLinkId: "req-1",
            paymentUrl: "https://testingmayar.myr.id/pl/abc",
          }),
        }),
      );
    });

    it("returns 500 when createMayarPayment throws", async () => {
      authMock.mockResolvedValueOnce({
        user: { id: "user-1" },
        expires: new Date().toISOString(),
      });
      createMayarPaymentMock.mockRejectedValueOnce(new Error("Mayar API down"));

      const res = await POST_CREATE(
        new Request("http://localhost/api/payment/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ packageId: "pocket" }),
        }),
      );

      expect(res.status).toBe(500);
    });
  });

  describe("POST /api/payment/webhook", () => {
    it("rejects requests with an invalid or missing webhook token", async () => {
      verifyMayarWebhookRequestMock.mockReturnValue(false);

      const res = await POST_WEBHOOK(
        new Request("http://localhost/api/payment/webhook", {
          method: "POST",
          body: JSON.stringify({
            event: "payment.received",
            data: {
              id: "txn-1",
              transactionId: "txn-1",
            },
          }),
        }),
      );

      expect(res.status).toBe(401);
      expect(getMayarTransactionMock).not.toHaveBeenCalled();
    });

    it("ignores non-payment.received events", async () => {
      const res = await POST_WEBHOOK(
        new Request("http://localhost/api/payment/webhook", {
          method: "POST",
          body: JSON.stringify({
            event: "payment.reminder",
            data: {
              id: "txn-1",
              transactionId: "txn-1",
            },
          }),
        }),
      );

      expect(res.status).toBe(200);
      expect(prismaPaymentFindUniqueMock).not.toHaveBeenCalled();
    });

    it("handles webhook notifications and calls Mayar to verify before crediting", async () => {
      const pendingRow = {
        userId: "user_1",
        orderId: "INV-USER1-12345",
        amount: 2900,
        energyGranted: 50000,
        status: "PENDING",
        providerTxnId: "txn-1",
        metadata: { packageName: "Pocket Booster" },
      };
      prismaPaymentFindUniqueMock.mockResolvedValue(pendingRow);
      prismaPaymentFindUniqueOrThrowMock.mockResolvedValue(pendingRow);

      getMayarTransactionMock.mockResolvedValueOnce({
        status: "paid",
        amount: 2900,
        paymentMethod: "QRIS",
      });

      const res = await POST_WEBHOOK(
        new Request("http://localhost/api/payment/webhook", {
          method: "POST",
          body: JSON.stringify({
            event: "payment.received",
            data: {
              id: "txn-1",
              transactionId: "txn-1",
              transactionStatus: "paid",
              amount: 2900,
            },
          }),
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(getMayarTransactionMock).toHaveBeenCalledWith("txn-1");

      // Prisma transaction callbacks executed raw queries to award premium credit
      expect(prismaExecuteRawMock).toHaveBeenCalled();

      // Email receipt sent with correct data
      await vi.waitFor(() => {
        expect(sendPaymentReceiptMock).toHaveBeenCalledWith(
          "user@example.com",
          expect.objectContaining({
            packageName: "Pocket Booster",
            amount: 2900,
            energyGranted: 50000,
          }),
        );
      });
    });

    it("ignores webhook notifications if payment is already COMPLETED (idempotency)", async () => {
      prismaPaymentFindUniqueMock.mockResolvedValueOnce({
        userId: "user_1",
        orderId: "INV-USER1-12345",
        amount: 2900,
        energyGranted: 50000,
        status: "COMPLETED",
        providerTxnId: "txn-1",
      });

      const res = await POST_WEBHOOK(
        new Request("http://localhost/api/payment/webhook", {
          method: "POST",
          body: JSON.stringify({
            event: "payment.received",
            data: {
              id: "txn-1",
              transactionId: "txn-1",
              transactionStatus: "paid",
              amount: 2900,
            },
          }),
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(getMayarTransactionMock).not.toHaveBeenCalled();
      expect(prismaTransactionMock).not.toHaveBeenCalled();
    });

    it("rejects webhook if verification API does not return a paid status", async () => {
      prismaPaymentFindUniqueMock.mockResolvedValueOnce({
        userId: "user_1",
        orderId: "INV-USER1-12345",
        amount: 2900,
        energyGranted: 50000,
        status: "PENDING",
        providerTxnId: "txn-1",
      });

      getMayarTransactionMock.mockResolvedValueOnce({
        status: "pending",
        amount: 2900,
        paymentMethod: "QRIS",
      });

      const res = await POST_WEBHOOK(
        new Request("http://localhost/api/payment/webhook", {
          method: "POST",
          body: JSON.stringify({
            event: "payment.received",
            data: {
              id: "txn-1",
              transactionId: "txn-1",
              transactionStatus: "paid",
              amount: 2900,
            },
          }),
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain("not fully completed");
      expect(prismaTransactionMock).not.toHaveBeenCalled();
    });

    it("rejects webhook if the verified amount does not match the stored payment amount", async () => {
      prismaPaymentFindUniqueMock.mockResolvedValueOnce({
        userId: "user_1",
        orderId: "INV-USER1-12345",
        amount: 8900,
        energyGranted: 200000,
        status: "PENDING",
        providerTxnId: "txn-1",
      });

      // Someone tampered with the QRIS amount at scan time — verified
      // amount from Mayar's API does not match what we charged for.
      getMayarTransactionMock.mockResolvedValueOnce({
        status: "paid",
        amount: 1000,
        paymentMethod: "QRIS",
      });

      const res = await POST_WEBHOOK(
        new Request("http://localhost/api/payment/webhook", {
          method: "POST",
          body: JSON.stringify({
            event: "payment.received",
            data: {
              id: "txn-1",
              transactionId: "txn-1",
              transactionStatus: "paid",
              amount: 1000,
            },
          }),
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain("amount");
      expect(prismaTransactionMock).not.toHaveBeenCalled();
    });

    it("returns 404 when no Payment matches the webhook's providerTxnId", async () => {
      prismaPaymentFindUniqueMock.mockResolvedValueOnce(null);

      const res = await POST_WEBHOOK(
        new Request("http://localhost/api/payment/webhook", {
          method: "POST",
          body: JSON.stringify({
            event: "payment.received",
            data: {
              id: "txn-not-found",
              transactionId: "txn-not-found",
              transactionStatus: "paid",
              amount: 2900,
            },
          }),
        }),
      );

      expect(res.status).toBe(404);
    });

    it("handles race condition gracefully when updateMany returns count 0", async () => {
      const pendingRow = {
        userId: "user_1",
        orderId: "INV-USER1-12345",
        amount: 2900,
        energyGranted: 50000,
        status: "PENDING",
        providerTxnId: "txn-1",
        metadata: { packageName: "Pocket Booster" },
      };
      prismaPaymentFindUniqueMock.mockResolvedValue(pendingRow);
      getMayarTransactionMock.mockResolvedValueOnce({
        status: "paid",
        amount: 2900,
        paymentMethod: "QRIS",
      });
      // Simulate another handler already won the atomic claim
      prismaPaymentUpdateManyMock.mockResolvedValueOnce({ count: 0 });

      const res = await POST_WEBHOOK(
        new Request("http://localhost/api/payment/webhook", {
          method: "POST",
          body: JSON.stringify({
            event: "payment.received",
            data: {
              id: "txn-1",
              transactionId: "txn-1",
              transactionStatus: "paid",
              amount: 2900,
            },
          }),
        }),
      );

      expect(res.status).toBe(200);
      expect(prismaExecuteRawMock).not.toHaveBeenCalled(); // no energy credit
    });
  });

  describe("GET /api/payment/status/$orderId", () => {
    it("requires login and protects against access of other user invoices", async () => {
      authMock.mockResolvedValueOnce({
        user: { id: "user_other" },
      });

      prismaPaymentFindUniqueMock.mockResolvedValueOnce({
        userId: "user_1",
        orderId: "INV-USER1-12345",
        amount: 2900,
        status: "PENDING",
        providerTxnId: "txn-1",
        createdAt: new Date(),
      });

      const res = await GET_STATUS(undefined, { orderId: "INV-USER1-12345" });
      expect(res.status).toBe(403);
    });

    it("returns correct payment status for owner without reconciling when recently created", async () => {
      authMock.mockResolvedValueOnce({
        user: { id: "user_1" },
      });

      prismaPaymentFindUniqueMock.mockResolvedValueOnce({
        userId: "user_1",
        orderId: "INV-USER1-12345",
        amount: 2900,
        status: "PENDING",
        paymentMethod: "qris",
        providerTxnId: "txn-1",
        createdAt: new Date(), // just created — inside the reconciliation grace window
      });

      const res = await GET_STATUS(undefined, { orderId: "INV-USER1-12345" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.status).toBe("PENDING");
      expect(getMayarTransactionMock).not.toHaveBeenCalled();
    });

    it("reconciles against Mayar directly when PENDING beyond the grace window", async () => {
      authMock.mockResolvedValueOnce({
        user: { id: "user_1" },
      });

      const oldCreatedAt = new Date(Date.now() - 3 * 60 * 1000); // 3 minutes ago
      prismaPaymentFindUniqueMock.mockResolvedValueOnce({
        userId: "user_1",
        orderId: "INV-USER1-12345",
        amount: 2900,
        status: "PENDING",
        paymentMethod: "qris",
        providerTxnId: "txn-1",
        createdAt: oldCreatedAt,
      });

      getMayarTransactionMock.mockResolvedValueOnce({
        status: "paid",
        amount: 2900,
        paymentMethod: "QRIS",
      });

      prismaPaymentUpdateManyMock.mockResolvedValueOnce({ count: 1 });
      prismaPaymentFindUniqueOrThrowMock.mockResolvedValueOnce({
        userId: "user_1",
        orderId: "INV-USER1-12345",
        amount: 2900,
        energyGranted: 50000,
        status: "COMPLETED",
        metadata: { packageName: "Pocket Booster" },
      });

      const res = await GET_STATUS(undefined, { orderId: "INV-USER1-12345" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(getMayarTransactionMock).toHaveBeenCalledWith("txn-1");
      expect(data.status).toBe("COMPLETED");
    });

    it("returns DB status without calling Mayar when providerTxnId is null", async () => {
      authMock.mockResolvedValueOnce({ user: { id: "user-1" } });
      const recentPending = {
        userId: "user-1",
        orderId: "INV-USER1-12345",
        amount: 2900,
        energyGranted: 50000,
        status: "PENDING",
        providerTxnId: null,
        createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 mins old, beyond grace window
        metadata: {},
      };
      prismaPaymentFindUniqueMock.mockResolvedValue(recentPending);

      const res = await GET_STATUS(undefined, { orderId: "INV-USER1-12345" });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(getMayarTransactionMock).not.toHaveBeenCalled();
      expect(body.status).toBe("PENDING");
    });

    it("falls back to DB status when getMayarTransaction throws", async () => {
      authMock.mockResolvedValueOnce({ user: { id: "user-1" } });
      const stalePending = {
        userId: "user-1",
        orderId: "INV-USER1-12345",
        amount: 2900,
        energyGranted: 50000,
        status: "PENDING",
        providerTxnId: "txn-1",
        createdAt: new Date(Date.now() - 5 * 60 * 1000), // beyond grace window
        metadata: {},
      };
      prismaPaymentFindUniqueMock.mockResolvedValue(stalePending);
      getMayarTransactionMock.mockRejectedValueOnce(
        new Error("Mayar API timeout"),
      );

      const res = await GET_STATUS(undefined, { orderId: "INV-USER1-12345" });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.status).toBe("PENDING"); // DB status returned as fallback
    });
  });
});

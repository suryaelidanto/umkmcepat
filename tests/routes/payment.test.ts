import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  createMayarPaymentMock,
  getBoosterPackMock,
  getMayarTransactionMock,
  verifyMayarWebhookRequestMock,
  // TODO(task-5): replace with Mayar equivalents when webhook route migrates
  verifyPakasirTransactionMock,
  prismaPaymentCreateMock,
  prismaPaymentFindUniqueMock,
  prismaPaymentUpdateMock,
  prismaPaymentUpdateManyMock,
  prismaPaymentFindUniqueOrThrowMock,
  prismaExecuteRawMock,
  prismaTransactionMock,
} = vi.hoisted(() => ({
  authMock: vi.fn<() => Promise<unknown>>(async () => null),
  createMayarPaymentMock: vi.fn(),
  getBoosterPackMock: vi.fn(),
  getMayarTransactionMock: vi.fn(),
  verifyMayarWebhookRequestMock: vi.fn(() => true),
  // TODO(task-5): remove when webhook route migrates from Pakasir to Mayar
  verifyPakasirTransactionMock: vi.fn(),
  prismaPaymentCreateMock: vi.fn(),
  prismaPaymentFindUniqueMock: vi.fn(),
  prismaPaymentUpdateMock: vi.fn(),
  prismaPaymentUpdateManyMock: vi.fn(async () => ({ count: 1 })),
  prismaPaymentFindUniqueOrThrowMock: vi.fn(),
  prismaExecuteRawMock: vi.fn(async () => 1),
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

vi.mock("@/lib/auth", () => ({ auth: authMock }));
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
// TODO(task-5): remove when webhook route migrates from Pakasir to Mayar
vi.mock("@/lib/pakasir", () => ({
  verifyPakasirTransaction: verifyPakasirTransactionMock,
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
  },
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
    // TODO(task-5): remove when webhook route migrates from Pakasir to Mayar
    verifyPakasirTransactionMock.mockReset();
    prismaPaymentCreateMock.mockReset();
    prismaPaymentFindUniqueMock.mockReset();
    prismaPaymentFindUniqueOrThrowMock.mockReset();
    prismaPaymentUpdateMock.mockReset();
    prismaPaymentUpdateManyMock.mockReset();
    prismaPaymentUpdateManyMock.mockImplementation(async () => ({ count: 1 }));
    prismaExecuteRawMock.mockClear();
    prismaTransactionMock.mockClear();
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
    it("handles webhook notifications and calls Pakasir to verify before crediting", async () => {
      const pendingRow = {
        userId: "user_1",
        orderId: "INV-USER1-12345",
        amount: 2900,
        energyGranted: 50000,
        status: "PENDING",
        metadata: { packageName: "Pocket Booster" },
      };
      prismaPaymentFindUniqueMock.mockResolvedValue(pendingRow);
      prismaPaymentFindUniqueOrThrowMock.mockResolvedValue(pendingRow);

      verifyPakasirTransactionMock.mockResolvedValueOnce({
        order_id: "INV-USER1-12345",
        amount: 2900,
        status: "completed",
        payment_method: "qris",
      });

      const res = await POST_WEBHOOK(
        new Request("http://localhost/api/payment/webhook", {
          method: "POST",
          body: JSON.stringify({
            order_id: "INV-USER1-12345",
            amount: 2900,
            project: "umkm-cepat-dev",
            status: "completed",
            payment_method: "qris",
            completed_at: "2026-07-19T10:00:00Z",
          }),
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(verifyPakasirTransactionMock).toHaveBeenCalledWith({
        orderId: "INV-USER1-12345",
        amount: 2900,
      });

      // Prisma transaction callbacks executed raw queries to award premium credit
      expect(prismaExecuteRawMock).toHaveBeenCalled();
    });

    it("ignores webhook notifications if payment is already COMPLETED (idempotency)", async () => {
      // Pre-transaction fetch returns COMPLETED, so the route short-circuits
      // with 200 before claiming. The atomic claim would also return
      // { count: 0 } — both paths agree.
      prismaPaymentFindUniqueMock.mockResolvedValueOnce({
        userId: "user_1",
        orderId: "INV-USER1-12345",
        amount: 2900,
        energyGranted: 50000,
        status: "COMPLETED",
      });

      const res = await POST_WEBHOOK(
        new Request("http://localhost/api/payment/webhook", {
          method: "POST",
          body: JSON.stringify({
            order_id: "INV-USER1-12345",
            amount: 2900,
            project: "umkm-cepat-dev",
            status: "completed",
            payment_method: "qris",
          }),
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(verifyPakasirTransactionMock).not.toHaveBeenCalled();
      expect(prismaTransactionMock).not.toHaveBeenCalled();
    });

    it("rejects webhook if verification API does not return completed status", async () => {
      prismaPaymentFindUniqueMock.mockResolvedValueOnce({
        userId: "user_1",
        orderId: "INV-USER1-12345",
        amount: 2900,
        energyGranted: 50000,
        status: "PENDING",
      });

      // Verification API returns pending/failed
      verifyPakasirTransactionMock.mockResolvedValueOnce({
        order_id: "INV-USER1-12345",
        amount: 2900,
        status: "pending",
      });

      const res = await POST_WEBHOOK(
        new Request("http://localhost/api/payment/webhook", {
          method: "POST",
          body: JSON.stringify({
            order_id: "INV-USER1-12345",
            amount: 2900,
            project: "umkm-cepat-dev",
            status: "completed",
            payment_method: "qris",
          }),
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain("not fully completed");
      expect(prismaTransactionMock).not.toHaveBeenCalled();
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
      });

      const res = await GET_STATUS(undefined, { orderId: "INV-USER1-12345" });
      expect(res.status).toBe(403);
    });

    it("returns correct payment status for owner", async () => {
      authMock.mockResolvedValueOnce({
        user: { id: "user_1" },
      });

      prismaPaymentFindUniqueMock.mockResolvedValueOnce({
        userId: "user_1",
        orderId: "INV-USER1-12345",
        amount: 2900,
        status: "PENDING",
        paymentMethod: "qris",
        createdAt: new Date(),
      });

      const res = await GET_STATUS(undefined, { orderId: "INV-USER1-12345" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.status).toBe("PENDING");
    });
  });
});

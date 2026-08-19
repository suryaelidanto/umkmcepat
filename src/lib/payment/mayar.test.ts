import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("MAYAR_API_KEY", "test-api-key");
  vi.stubEnv("MAYAR_API_BASE_URL", "https://api.mayar.club/hl/v2");
  vi.stubEnv("MAYAR_WEBHOOK_TOKEN", "test-webhook-token");
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createMayarPayment", () => {
  it("posts to /invoices/create with customer fields, items, and orderId in description", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 200,
          messages: "success",
          data: {
            id: "inv-1",
            transactionId: "txn-1",
            link: "https://umkmcepat.mayar.shop/invoices/abc",
          },
        }),
        { status: 200 },
      ),
    );

    const { createMayarPayment } = await import("./mayar");
    const expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const result = await createMayarPayment({
      orderId: "INV-USER1-12345",
      amount: 8900,
      packName: "Starter Booster",
      expiredAt,
      customerName: "Test User",
      customerEmail: "test@example.com",
      customerMobile: "081234567890",
    });

    expect(result).toEqual({
      id: "inv-1",
      transactionId: "txn-1",
      link: "https://umkmcepat.mayar.shop/invoices/abc",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mayar.club/hl/v2/invoices/create",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-key",
        }),
      }),
    );
    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body.name).toBe("Test User");
    expect(body.email).toBe("test@example.com");
    expect(body.mobile).toBe("081234567890");
    expect(body.amount).toBe(8900);
    expect(body.description).toBe("INV-USER1-12345");
    expect(body.expiredAt).toBe(expiredAt);
    expect(body.items).toEqual([
      { quantity: 1, rate: 8900, description: "Starter Booster" },
    ]);
  });

  it("throws when the API responds non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("Bad request", { status: 400 }),
    );

    const { createMayarPayment } = await import("./mayar");
    await expect(
      createMayarPayment({
        orderId: "INV-1",
        amount: 1000,
        packName: "X",
        expiredAt: new Date().toISOString(),
        customerName: "U",
        customerEmail: "u@e.com",
        customerMobile: "081",
      }),
    ).rejects.toThrow(/Mayar create payment failed/);
  });

  it("throws when the response is missing id, transactionId, or link", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ statusCode: 200, messages: "success", data: {} }),
        { status: 200 },
      ),
    );

    const { createMayarPayment } = await import("./mayar");
    await expect(
      createMayarPayment({
        orderId: "INV-1",
        amount: 1000,
        packName: "X",
        expiredAt: new Date().toISOString(),
        customerName: "U",
        customerEmail: "u@e.com",
        customerMobile: "081",
      }),
    ).rejects.toThrow(/missing/i);
  });
});

describe("getMayarTransaction", () => {
  it("gets /transactions/:id and returns status/amount/paymentMethod", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 200,
          messages: "success",
          data: { status: "paid", amount: 8900, paymentMethod: "QRIS" },
        }),
        { status: 200 },
      ),
    );

    const { getMayarTransaction } = await import("./mayar");
    const result = await getMayarTransaction("txn-1");

    expect(result).toEqual({
      status: "paid",
      amount: 8900,
      paymentMethod: "QRIS",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mayar.club/hl/v2/transactions/txn-1",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-key",
        }),
      }),
    );
  });

  it("throws when the API responds non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Not found", { status: 404 }));

    const { getMayarTransaction } = await import("./mayar");
    await expect(getMayarTransaction("txn-missing")).rejects.toThrow(
      /Mayar get transaction failed/,
    );
  });
});

describe("verifyMayarWebhookRequest", () => {
  it("accepts a request with correct ?token= query param", async () => {
    const { verifyMayarWebhookRequest } = await import("./mayar");
    const request = new Request(
      "http://localhost/api/payment/webhook?token=test-webhook-token",
      { method: "POST" },
    );
    expect(verifyMayarWebhookRequest(request)).toBe(true);
  });

  it("rejects wrong or missing token", async () => {
    const { verifyMayarWebhookRequest } = await import("./mayar");
    const wrong = new Request(
      "http://localhost/api/payment/webhook?token=wrong",
      { method: "POST" },
    );
    const none = new Request("http://localhost/api/payment/webhook", {
      method: "POST",
    });
    expect(verifyMayarWebhookRequest(wrong)).toBe(false);
    expect(verifyMayarWebhookRequest(none)).toBe(false);
  });
});

describe("getBoosterPack", () => {
  it("falls back to BOOSTER_PACKS when no AppSetting override exists", async () => {
    vi.resetModules();
    vi.doMock("@/lib/config/app-settings", () => ({
      getSetting: vi.fn(async (_key: string, fallback: number) => fallback),
    }));
    const { getBoosterPack, BOOSTER_PACKS } = await import("./mayar");
    const result = await getBoosterPack("starter");
    expect(result).toEqual({
      amount: BOOSTER_PACKS.starter.amount,
      compareAtAmount: BOOSTER_PACKS.starter.compareAtAmount,
      energy: BOOSTER_PACKS.starter.energy,
      name: BOOSTER_PACKS.starter.name,
    });
    vi.doUnmock("@/lib/config/app-settings");
    vi.resetModules();
  });
});

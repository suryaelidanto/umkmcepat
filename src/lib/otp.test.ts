import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createOtpRequest,
  generateOtpCode,
  sendOtpViaSms,
  verifyOtp,
} from "./otp";

const prismaOtpRequestCreateMock = vi.fn();
const prismaOtpRequestFindFirstMock = vi.fn();
const prismaOtpRequestUpdateMock = vi.fn();
const prismaUserFindUniqueMock = vi.fn();
const prismaUserUpdateMock = vi.fn();
const prismaTransactionMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    otpRequest: {
      create: (...args: unknown[]) => prismaOtpRequestCreateMock(...args),
      findFirst: (...args: unknown[]) => prismaOtpRequestFindFirstMock(...args),
      update: (...args: unknown[]) => prismaOtpRequestUpdateMock(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => prismaUserFindUniqueMock(...args),
      update: (...args: unknown[]) => prismaUserUpdateMock(...args),
    },
    $transaction: (...args: unknown[]) => prismaTransactionMock(...args),
  },
}));

const originalEnv = { ...process.env };
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generateOtpCode", () => {
  it("generates a 6-digit numeric string", () => {
    const code = generateOtpCode();
    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });
});

describe("createOtpRequest", () => {
  it("hashes code and stores it in DB", async () => {
    prismaOtpRequestCreateMock.mockResolvedValue({ id: "req_1" });
    const { code, expiresAt } = await createOtpRequest("user_1", "+628123");

    expect(code).toHaveLength(6);
    expect(expiresAt).toBeInstanceOf(Date);
    expect(prismaOtpRequestCreateMock).toHaveBeenCalledTimes(1);

    const callArgs = prismaOtpRequestCreateMock.mock.calls[0][0];
    expect(callArgs.data.userId).toBe("user_1");
    expect(callArgs.data.phone).toBe("+628123");
    expect(callArgs.data.codeHash).toHaveLength(64); // SHA-256 is 64 hex characters
    expect(callArgs.data.code).toBeUndefined(); // code should not be stored directly
  });
});

describe("verifyOtp", () => {
  beforeEach(() => {
    prismaUserFindUniqueMock.mockResolvedValue({
      id: "user_1",
      otpAttempts: 0,
      otpLockedUntil: null,
    });
  });

  it("checks if user is locked", async () => {
    prismaUserFindUniqueMock.mockResolvedValue({
      id: "user_1",
      otpAttempts: 3,
      otpLockedUntil: new Date(Date.now() + 10 * 60 * 1000), // locked for 10 more minutes
    });

    const res = await verifyOtp("user_1", "+628123", "123456");
    expect(res.success).toBe(false);
    expect(res.error).toContain("dikunci");
    expect(prismaOtpRequestFindFirstMock).not.toHaveBeenCalled();
  });

  it("verifies with correct code", async () => {
    const code = "123456";
    // SHA-256 of "123456"
    const expectedHash =
      "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";

    const mockRequest = {
      id: "req_1",
      userId: "user_1",
      phone: "+628123",
      codeHash: expectedHash,
      attempts: 0,
      used: false,
    };
    prismaOtpRequestFindFirstMock.mockResolvedValueOnce(mockRequest);
    prismaTransactionMock.mockResolvedValueOnce([{}, {}]);

    const res = await verifyOtp("user_1", "+628123", code);
    expect(res.success).toBe(true);
    expect(prismaTransactionMock).toHaveBeenCalledTimes(1);
  });

  it("handles incorrect code and increments request attempts", async () => {
    const mockRequest = {
      id: "req_1",
      userId: "user_1",
      phone: "+628123",
      codeHash: "hash_of_actual_code",
      attempts: 0,
      used: false,
    };
    // 1st call for retrieval by codeHash returns null (no match)
    prismaOtpRequestFindFirstMock.mockResolvedValueOnce(null);
    // 2nd call for backup retrieval by user/phone returns mockRequest
    prismaOtpRequestFindFirstMock.mockResolvedValueOnce(mockRequest);
    prismaOtpRequestUpdateMock.mockResolvedValueOnce({
      ...mockRequest,
      attempts: 1,
    });

    const res = await verifyOtp("user_1", "+628123", "wrong_code");
    expect(res.success).toBe(false);
    expect(res.error).toBe("Kode OTP salah.");
    expect(prismaOtpRequestUpdateMock).toHaveBeenCalledWith({
      where: { id: "req_1" },
      data: { attempts: 1 },
    });
  });

  it("increments user otpAttempts when request attempts reach 3", async () => {
    const mockRequest = {
      id: "req_1",
      userId: "user_1",
      phone: "+628123",
      codeHash: "hash_of_actual_code",
      attempts: 2, // will become 3
      used: false,
    };
    prismaOtpRequestFindFirstMock.mockResolvedValueOnce(null);
    prismaOtpRequestFindFirstMock.mockResolvedValueOnce(mockRequest);
    prismaOtpRequestUpdateMock.mockResolvedValueOnce({
      ...mockRequest,
      attempts: 3,
    });
    prismaUserUpdateMock.mockResolvedValueOnce({});

    const res = await verifyOtp("user_1", "+628123", "wrong_code");
    expect(res.success).toBe(false);
    expect(res.error).toBe("Terlalu banyak percobaan. Minta kode baru.");
    expect(prismaUserUpdateMock).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { otpAttempts: 1 },
    });
  });

  it("locks user for 30 minutes when user otpAttempts reaches 5", async () => {
    prismaUserFindUniqueMock.mockResolvedValue({
      id: "user_1",
      otpAttempts: 4, // will become 5
      otpLockedUntil: null,
    });
    const mockRequest = {
      id: "req_1",
      userId: "user_1",
      phone: "+628123",
      codeHash: "hash_of_actual_code",
      attempts: 2,
      used: false,
    };
    prismaOtpRequestFindFirstMock.mockResolvedValueOnce(null);
    prismaOtpRequestFindFirstMock.mockResolvedValueOnce(mockRequest);
    prismaOtpRequestUpdateMock.mockResolvedValueOnce({
      ...mockRequest,
      attempts: 3,
    });
    prismaUserUpdateMock.mockResolvedValueOnce({});

    const res = await verifyOtp("user_1", "+628123", "wrong_code");
    expect(res.success).toBe(false);
    expect(res.error).toContain("dikunci");

    expect(prismaUserUpdateMock).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: expect.objectContaining({
        otpAttempts: 5,
        otpLockedUntil: expect.any(Date),
      }),
    });
  });
});

describe("sendOtpViaSms", () => {
  it("mock mode: no key + dev -> logs + success, no fetch", async () => {
    delete process.env.OTP_SPACE_API_KEY;
    process.env.NODE_ENV = "development";
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await sendOtpViaSms("+628123", "123456");
    expect(r.success).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("mock mode"));
    log.mockRestore();
  });

  it("real mode: POST /v1/send with {phone, app_name} + Bearer", async () => {
    process.env.OTP_SPACE_API_KEY = "sk_live_test";
    process.env.NODE_ENV = "production";
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await sendOtpViaSms("+628123", "123456");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.otpspace.com/v1/send");
    expect(init.headers.Authorization).toBe("Bearer sk_live_test");
    const body = JSON.parse(init.body);
    expect(body.phone).toBe("+628123");
    expect(body.app_name).toBe("UMKM Cepat");
  });

  it("prod + no key -> throws", async () => {
    delete process.env.OTP_SPACE_API_KEY;
    process.env.NODE_ENV = "production";
    await expect(sendOtpViaSms("+628123", "123456")).rejects.toThrow(
      /OTP_SPACE_API_KEY/,
    );
  });
});

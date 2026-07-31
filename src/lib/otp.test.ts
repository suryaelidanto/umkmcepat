import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createOtpRequest,
  generateOtpCode,
  sendOtpViaSms,
  toOtpSpacePhone,
  verifyOtp,
} from "./otp";

const prismaOtpRequestCreateMock = vi.fn();
const prismaOtpRequestFindFirstMock = vi.fn();
const prismaOtpRequestUpdateMock = vi.fn();
const prismaUserFindUniqueMock = vi.fn();
const prismaUserFindFirstMock = vi.fn();
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
      findFirst: (...args: unknown[]) => prismaUserFindFirstMock(...args),
      update: (...args: unknown[]) => prismaUserUpdateMock(...args),
    },
    $transaction: (...args: unknown[]) => prismaTransactionMock(...args),
  },
}));

const VALID_PHONE = "+6281234567890";

const originalEnv = { ...process.env };
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  process.env = { ...originalEnv };
  delete process.env.OTP_SPACE_API_KEY;
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

describe("toOtpSpacePhone", () => {
  it("strips leading +", () => {
    expect(toOtpSpacePhone("+6281234567890")).toBe("6281234567890");
  });
});

describe("createOtpRequest", () => {
  it("hashes code in mock mode (no API key)", async () => {
    prismaOtpRequestCreateMock.mockResolvedValue({ id: "req_1" });
    const { code, expiresAt } = await createOtpRequest("user_1", VALID_PHONE);

    expect(code).toHaveLength(6);
    expect(expiresAt).toBeInstanceOf(Date);
    expect(prismaOtpRequestCreateMock).toHaveBeenCalledTimes(1);

    const callArgs = prismaOtpRequestCreateMock.mock.calls[0][0];
    expect(callArgs.data.userId).toBe("user_1");
    expect(callArgs.data.phone).toBe(VALID_PHONE);
    expect(callArgs.data.codeHash).toHaveLength(64);
    expect(callArgs.data.code).toBeUndefined();
  });

  it("stores provider-managed marker when API key is set", async () => {
    process.env.OTP_SPACE_API_KEY = "sk_live_test";
    prismaOtpRequestCreateMock.mockResolvedValue({ id: "req_1" });
    await createOtpRequest("user_1", VALID_PHONE);
    const callArgs = prismaOtpRequestCreateMock.mock.calls[0][0];
    expect(callArgs.data.codeHash).toBe("provider-managed");
  });
});

describe("verifyOtp (mock / local hash)", () => {
  beforeEach(() => {
    delete process.env.OTP_SPACE_API_KEY;
    prismaUserFindUniqueMock.mockResolvedValue({
      id: "user_1",
      otpAttempts: 0,
      otpLockedUntil: null,
    });
    prismaUserFindFirstMock.mockResolvedValue(null);
  });

  it("checks if user is locked", async () => {
    prismaUserFindUniqueMock.mockResolvedValue({
      id: "user_1",
      otpAttempts: 3,
      otpLockedUntil: new Date(Date.now() + 10 * 60 * 1000),
    });

    const res = await verifyOtp("user_1", VALID_PHONE, "123456");
    expect(res.success).toBe(false);
    expect(res.error).toContain("dikunci");
    expect(prismaOtpRequestFindFirstMock).not.toHaveBeenCalled();
  });

  it("rejects invalid phone format", async () => {
    const res = await verifyOtp("user_1", "not-a-phone", "123456");
    expect(res.success).toBe(false);
    expect(res.error).toContain("tidak valid");
  });

  it("verifies with correct code", async () => {
    const code = "123456";
    const expectedHash =
      "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";

    const mockRequest = {
      id: "req_1",
      userId: "user_1",
      phone: VALID_PHONE,
      codeHash: expectedHash,
      attempts: 0,
      used: false,
    };
    prismaOtpRequestFindFirstMock.mockResolvedValueOnce(mockRequest);
    prismaTransactionMock.mockResolvedValueOnce([{}, {}]);

    const res = await verifyOtp("user_1", VALID_PHONE, code);
    expect(res.success).toBe(true);
    expect(prismaTransactionMock).toHaveBeenCalledTimes(1);
  });

  it("rejects when phone already claimed by another user", async () => {
    const code = "123456";
    const expectedHash =
      "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
    prismaOtpRequestFindFirstMock.mockResolvedValueOnce({
      id: "req_1",
      userId: "user_1",
      phone: VALID_PHONE,
      codeHash: expectedHash,
      attempts: 0,
      used: false,
    });
    prismaUserFindFirstMock.mockResolvedValueOnce({ id: "user_2" });

    const res = await verifyOtp("user_1", VALID_PHONE, code);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Nomor ini sudah terpakai di akun lain.");
    expect(prismaTransactionMock).not.toHaveBeenCalled();
  });

  it("handles incorrect code and increments request attempts", async () => {
    const mockRequest = {
      id: "req_1",
      userId: "user_1",
      phone: VALID_PHONE,
      codeHash: "hash_of_actual_code",
      attempts: 0,
      used: false,
    };
    prismaOtpRequestFindFirstMock.mockResolvedValueOnce(mockRequest);
    prismaOtpRequestUpdateMock.mockResolvedValueOnce({
      ...mockRequest,
      attempts: 1,
    });

    const res = await verifyOtp("user_1", VALID_PHONE, "000000");
    expect(res.success).toBe(false);
    expect(res.error).toBe("Kode OTP salah.");
    expect(prismaOtpRequestUpdateMock).toHaveBeenCalledWith({
      where: { id: "req_1" },
      data: { attempts: 1 },
    });
  });

  it("increments user otpAttempts when request attempts reach 5", async () => {
    const mockRequest = {
      id: "req_1",
      userId: "user_1",
      phone: VALID_PHONE,
      codeHash: "hash_of_actual_code",
      attempts: 4,
      used: false,
    };
    prismaOtpRequestFindFirstMock.mockResolvedValueOnce(mockRequest);
    prismaOtpRequestUpdateMock.mockResolvedValueOnce({
      ...mockRequest,
      attempts: 5,
    });
    prismaUserUpdateMock.mockResolvedValueOnce({});

    const res = await verifyOtp("user_1", VALID_PHONE, "000000");
    expect(res.success).toBe(false);
    expect(res.error).toBe("Terlalu banyak percobaan. Minta kode baru.");
    expect(prismaUserUpdateMock).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { otpAttempts: 1 },
    });
  });

  it("locks user for 5 minutes when user otpAttempts reaches 5", async () => {
    prismaUserFindUniqueMock.mockResolvedValue({
      id: "user_1",
      otpAttempts: 4,
      otpLockedUntil: null,
    });
    const mockRequest = {
      id: "req_1",
      userId: "user_1",
      phone: VALID_PHONE,
      codeHash: "hash_of_actual_code",
      attempts: 4,
      used: false,
    };
    prismaOtpRequestFindFirstMock.mockResolvedValueOnce(mockRequest);
    prismaOtpRequestUpdateMock.mockResolvedValueOnce({
      ...mockRequest,
      attempts: 5,
    });
    prismaUserUpdateMock.mockResolvedValueOnce({});

    const res = await verifyOtp("user_1", VALID_PHONE, "000000");
    expect(res.success).toBe(false);
    expect(res.error).toContain("5 menit");

    expect(prismaUserUpdateMock).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: expect.objectContaining({
        otpAttempts: 5,
        otpLockedUntil: expect.any(Date),
      }),
    });
  });
});

describe("verifyOtp (provider mode)", () => {
  beforeEach(() => {
    process.env.OTP_SPACE_API_KEY = "sk_live_test";
    prismaUserFindUniqueMock.mockResolvedValue({
      id: "user_1",
      otpAttempts: 0,
      otpLockedUntil: null,
    });
    prismaUserFindFirstMock.mockResolvedValue(null);
  });

  it("verifies via OTP Space and claims phone", async () => {
    prismaOtpRequestFindFirstMock.mockResolvedValueOnce({
      id: "req_1",
      userId: "user_1",
      phone: VALID_PHONE,
      codeHash: "provider-managed",
      attempts: 0,
      used: false,
    });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    prismaTransactionMock.mockResolvedValueOnce([{}, {}]);

    const res = await verifyOtp("user_1", VALID_PHONE, "441699");
    expect(res.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.otpspace.com/v1/otp/verify",
      expect.objectContaining({
        method: "POST",
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ phone: "6281234567890", code: "441699" });
  });

  it("treats provider 400 as wrong code", async () => {
    prismaOtpRequestFindFirstMock.mockResolvedValueOnce({
      id: "req_1",
      userId: "user_1",
      phone: VALID_PHONE,
      codeHash: "provider-managed",
      attempts: 0,
      used: false,
    });
    fetchMock.mockResolvedValueOnce(new Response("bad", { status: 400 }));
    prismaOtpRequestUpdateMock.mockResolvedValueOnce({});

    const res = await verifyOtp("user_1", VALID_PHONE, "000000");
    expect(res.success).toBe(false);
    expect(res.error).toBe("Kode OTP salah.");
  });
});

describe("sendOtpViaSms", () => {
  it("mock mode: no key + dev -> logs + success, no fetch", async () => {
    delete process.env.OTP_SPACE_API_KEY;
    process.env.NODE_ENV = "development";
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await sendOtpViaSms(VALID_PHONE, "123456");
    expect(r.success).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("mock mode"));
    log.mockRestore();
  });

  it("real mode: POST /v1/otp/send with phone digits + Bearer", async () => {
    process.env.OTP_SPACE_API_KEY = "sk_live_test";
    process.env.NODE_ENV = "production";
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
    await sendOtpViaSms(VALID_PHONE, "123456");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.otpspace.com/v1/otp/send");
    expect(init.headers.Authorization).toBe("Bearer sk_live_test");
    const body = JSON.parse(init.body);
    expect(body.phone).toBe("6281234567890");
    expect(body.otp_length).toBe(6);
    expect(body.expiry_seconds).toBe(300);
  });

  it("prod + no key -> throws", async () => {
    delete process.env.OTP_SPACE_API_KEY;
    process.env.NODE_ENV = "production";
    await expect(sendOtpViaSms(VALID_PHONE, "123456")).rejects.toThrow(
      /OTP_SPACE_API_KEY/,
    );
  });
});

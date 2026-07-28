import { describe, expect, it } from "vitest";

import { mapToUserFacingError } from "@/lib/user-facing-error";

describe("mapToUserFacingError", () => {
  it("maps mayar-related errors to the Indonesian payment-failure message", () => {
    expect(
      mapToUserFacingError("Mayar create payment failed with status 500"),
    ).toBe("Pembayaran gagal. Coba lagi.");
  });

  it("maps mayar get-transaction errors to the same payment-failure message", () => {
    expect(
      mapToUserFacingError("Mayar get transaction failed with status 404"),
    ).toBe("Pembayaran gagal. Coba lagi.");
  });

  it("maps MAYAR_API_KEY errors to the payment-failure message", () => {
    expect(mapToUserFacingError("Missing MAYAR_API_KEY")).toBe(
      "Pembayaran gagal. Coba lagi.",
    );
  });

  it("returns a generic fallback for unknown reasons (never the raw string)", () => {
    expect(
      mapToUserFacingError("some internal postgres error: relation users_xyz"),
    ).toBe("Permintaan belum bisa diproses. Coba lagi nanti.");
  });
});

import { describe, expect, it } from "vitest";

import { mapToUserFacingError } from "@/lib/user-facing-error";

describe("mapToUserFacingError", () => {
  it("maps a known Pakasir reason to Indonesian", () => {
    expect(
      mapToUserFacingError(
        "Pakasir create transaction failed with status 500: upstream error",
      ),
    ).toBe("Pembayaran gagal. Coba lagi.");
  });

  it("returns a generic fallback for unknown reasons (never the raw string)", () => {
    expect(
      mapToUserFacingError("some internal postgres error: relation users_xyz"),
    ).toBe("Permintaan belum bisa diproses. Coba lagi nanti.");
  });
});

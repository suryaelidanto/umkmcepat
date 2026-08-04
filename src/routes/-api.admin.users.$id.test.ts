import { describe, expect, it } from "vitest";

import { parseAdminEnergyGrant } from "@/routes/api.admin.users.$id";

describe("parseAdminEnergyGrant", () => {
  it("accepts an integer grant in range", () => {
    expect(parseAdminEnergyGrant({ amount: 500_000 })).toEqual({
      ok: true,
      amount: 500_000,
    });
  });

  it.each([0, 2_000_001, 1.5, "500000", null])(
    "rejects invalid amount %j",
    (amount) => {
      expect(parseAdminEnergyGrant({ amount })).toEqual({
        ok: false,
        message: "amount harus bilangan bulat antara 1 dan 2.000.000.",
      });
    },
  );
});

import { expect, test } from "vitest";

import { getDiceBearAvatarUrl } from "./profile";

test("getDiceBearAvatarUrl formats Lorelei SVG API URL correctly", () => {
  expect(getDiceBearAvatarUrl("Surya")).toBe(
    "https://api.dicebear.com/9.x/lorelei/svg?seed=Surya",
  );
  expect(getDiceBearAvatarUrl("  Surya  ")).toBe(
    "https://api.dicebear.com/9.x/lorelei/svg?seed=Surya",
  );
  expect(getDiceBearAvatarUrl("")).toBe(
    "https://api.dicebear.com/9.x/lorelei/svg?seed=default",
  );
});

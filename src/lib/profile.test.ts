import { expect, test } from "vitest";

import { toPublicProfileImage } from "./profile";

test("toPublicProfileImage parses avatar path correctly", () => {
  expect(toPublicProfileImage("/api/profile/avatar")).toBe(
    "/api/profile/avatar",
  );
  expect(toPublicProfileImage("/api/profile/avatar?t=123")).toBe(
    "/api/profile/avatar?t=123",
  );
});

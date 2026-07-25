import { describe, expect, it } from "vitest";

import { resolveMediaRedirect } from "@/routes/media.$assetId";

describe("resolveMediaRedirect", () => {
  it("returns the publicUrl when present", () => {
    expect(
      resolveMediaRedirect({
        id: "a1",
        publicUrl: "https://pub.r2.dev/x.png",
      }),
    ).toEqual({
      location: "https://pub.r2.dev/x.png",
      status: 302,
    });
  });

  it("returns 404 when publicUrl is null", () => {
    expect(resolveMediaRedirect({ id: "a1", publicUrl: null })).toEqual({
      status: 404,
    });
  });

  it("returns 404 when the asset row is missing", () => {
    expect(resolveMediaRedirect(null)).toEqual({ status: 404 });
  });
});

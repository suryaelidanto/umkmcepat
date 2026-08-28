import { describe, expect, it } from "vitest";

import { resolveMediaRedirect } from "./api.media.$assetId";

describe("resolveMediaRedirect", () => {
  it("returns 404 when asset is null", () => {
    expect(resolveMediaRedirect(null)).toEqual({ status: 404 });
  });

  it("streams binary when publicUrl is on same app origin", () => {
    expect(
      resolveMediaRedirect({
        id: "a1",
        publicUrl: "http://localhost:3000/project-assets/a1.png",
      }),
    ).toEqual({
      stream: true,
      status: 200,
    });
  });

  it("returns 302 location when publicUrl is an external HTTPS CDN", () => {
    expect(
      resolveMediaRedirect({
        id: "a1",
        publicUrl: "https://pub-r2.example.com/project-assets/a1.png",
      }),
    ).toEqual({
      location: "https://pub-r2.example.com/project-assets/a1.png",
      status: 302,
    });
  });
});

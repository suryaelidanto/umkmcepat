import { describe, expect, it } from "vitest";

import { resolveMediaRedirect } from "./api.media.$assetId";

describe("resolveMediaRedirect", () => {
  it("returns 404 when asset is null", () => {
    expect(resolveMediaRedirect(null)).toEqual({ status: 404 });
  });

  it("streams binary when publicUrl is null or local", () => {
    expect(resolveMediaRedirect({ id: "a1", publicUrl: null })).toEqual({
      stream: true,
      status: 200,
    });
    expect(
      resolveMediaRedirect({
        id: "a1",
        publicUrl: "http://localhost:9000/bucket/img.png",
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

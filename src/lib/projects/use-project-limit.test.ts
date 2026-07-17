import { describe, expect, it } from "vitest";

import { readProjectLimitFromCache } from "./use-project-limit";

describe("readProjectLimitFromCache", () => {
  it("returns null when the cache is undefined", () => {
    expect(readProjectLimitFromCache(undefined)).toBeNull();
  });

  it("returns the first page's triplet when present", () => {
    const cache = {
      pages: [
        { projectCount: 6, projectLimit: 5, overProjectLimit: true },
        { projectCount: 6, projectLimit: 5, overProjectLimit: true },
      ],
      pageParams: [null],
    };

    expect(readProjectLimitFromCache(cache)).toEqual({
      count: 6,
      limit: 5,
      overLimit: true,
    });
  });

  it("returns null when the first page is missing the triplet", () => {
    const cache = { pages: [{}], pageParams: [null] };
    expect(readProjectLimitFromCache(cache)).toBeNull();
  });
});

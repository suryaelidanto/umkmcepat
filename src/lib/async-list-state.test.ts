import { describe, expect, it } from "vitest";

import { resolveAsyncListState } from "./async-list-state";

describe("resolveAsyncListState", () => {
  it("keeps an unresolved list in loading state", () => {
    expect(
      resolveAsyncListState({ isError: false, isPending: true, items: [] }),
    ).toBe("loading");
  });

  it("does not call a failed empty response an empty list", () => {
    expect(
      resolveAsyncListState({
        isError: true,
        isPending: false,
        items: undefined,
      }),
    ).toBe("error");
  });

  it("shows an empty state only after a successful empty response", () => {
    expect(
      resolveAsyncListState({ isError: false, isPending: false, items: [] }),
    ).toBe("empty");
  });

  it("keeps existing content visible while a refresh fails", () => {
    expect(
      resolveAsyncListState({
        isError: true,
        isPending: false,
        items: [{ id: "1" }],
      }),
    ).toBe("content");
  });
});

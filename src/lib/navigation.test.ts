import { describe, expect, it } from "vitest";

import { navigateTo } from "./navigation";

describe("navigateTo", () => {
  it("returns the router promise so callers can keep pending state until navigation settles", async () => {
    let resolveNavigation: () => void = () => undefined;
    const navigation = new Promise<void>((resolve) => {
      resolveNavigation = resolve;
    });
    const calls: Array<{ replace?: boolean; to: string }> = [];
    const router = {
      navigate: (options: { replace?: boolean; to: string }) => {
        calls.push(options);
        return navigation;
      },
    };

    let settled = false;
    const result = navigateTo(router, "/projects/project-1").then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    expect(calls).toEqual([{ to: "/projects/project-1" }]);

    resolveNavigation();
    await result;
    expect(settled).toBe(true);
  });
});

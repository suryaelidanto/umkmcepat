import { afterEach, describe, expect, it } from "vitest";

import {
  abortJob,
  clearJobAbort,
  registerJobAbort,
  resetJobAbortRegistryForTests,
} from "./job-abort-registry";

describe("job-abort-registry", () => {
  afterEach(() => {
    resetJobAbortRegistryForTests();
  });

  it("registerJobAbort returns a signal that is not aborted", () => {
    const signal = registerJobAbort("job_a");
    expect(signal.aborted).toBe(false);
  });

  it("abortJob aborts the registered signal and returns true", () => {
    const signal = registerJobAbort("job_b");
    expect(abortJob("job_b")).toBe(true);
    expect(signal.aborted).toBe(true);
  });

  it("abortJob on unknown id returns false", () => {
    expect(abortJob("missing")).toBe(false);
  });

  it("clearJobAbort removes the controller so later abort is no-op", () => {
    const signal = registerJobAbort("job_c");
    clearJobAbort("job_c");
    expect(abortJob("job_c")).toBe(false);
    expect(signal.aborted).toBe(false);
  });

  it("re-register replaces previous controller for the same id", () => {
    const first = registerJobAbort("job_d");
    const second = registerJobAbort("job_d");
    expect(first).not.toBe(second);
    abortJob("job_d");
    expect(first.aborted).toBe(false);
    expect(second.aborted).toBe(true);
  });
});

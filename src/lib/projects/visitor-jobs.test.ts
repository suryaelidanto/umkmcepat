import { describe, expect, it } from "vitest";

import {
  MAX_VISITOR_JOBS,
  parseVisitorJobs,
  type VisitorJob,
} from "./visitor-jobs";

const jobs: VisitorJob[] = [
  {
    id: "primary",
    goal: "Memahami menu dan cara pesan",
    priority: "primary",
  },
  {
    id: "visit-location",
    goal: "Menemukan lokasi kedai",
    priority: "secondary",
  },
];

describe("visitor jobs", () => {
  it("normalizes stable ids and preserves the accepted order", () => {
    expect(
      parseVisitorJobs([
        {
          id: " Visit Location ",
          goal: "  Menemukan lokasi kedai  ",
          priority: "secondary",
        },
        jobs[0],
      ]),
    ).toEqual({
      ok: true,
      value: [
        {
          id: "visit-location",
          goal: "Menemukan lokasi kedai",
          priority: "secondary",
        },
        jobs[0],
      ],
    });
  });

  it("rejects duplicate ids, multiple primaries, and over-limit lists", () => {
    expect(parseVisitorJobs([jobs[0], { ...jobs[1], id: "primary" }])).toEqual({
      ok: false,
      reason: "duplicate visitor job id: primary",
    });
    expect(
      parseVisitorJobs([
        jobs[0],
        { id: "second", goal: "Membandingkan pilihan", priority: "primary" },
      ]),
    ).toEqual({
      ok: false,
      reason: "visitor jobs require exactly one primary job",
    });
    expect(
      parseVisitorJobs(
        Array.from({ length: MAX_VISITOR_JOBS + 1 }, (_, index) => ({
          id: index === 0 ? "primary" : `job-${index}`,
          goal: `Tujuan ${index}`,
          priority: index === 0 ? "primary" : "secondary",
        })),
      ),
    ).toEqual({
      ok: false,
      reason: `visitor jobs support at most ${MAX_VISITOR_JOBS} jobs`,
    });
  });

  it("rejects malformed entries instead of inventing defaults", () => {
    expect(
      parseVisitorJobs([{ id: "primary", goal: "", priority: "primary" }]),
    ).toEqual({ ok: false, reason: "visitor job goal required: primary" });
    expect(parseVisitorJobs("primary")).toEqual({
      ok: false,
      reason: "visitor jobs must be an array",
    });
  });
});

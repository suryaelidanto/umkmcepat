import { describe, expect, it } from "vitest";

import corpusJson from "./__fixtures__/visual-reference-labels.json";
import { parseGeneratedSiteVisualReferenceCorpus } from "./generated-site-reference-corpus";

describe("generated-site visual reference corpus", () => {
  it("freezes the product owner's five accepted gallery labels", () => {
    const corpus = parseGeneratedSiteVisualReferenceCorpus(corpusJson);
    expect(corpus.accepted.map((item) => item.gallery)).toEqual([
      "01",
      "02",
      "03",
      "04",
      "07",
    ]);
    expect(corpus.rejectedVisibleCount).toBe(28);
    expect(corpus.technicalNegativeCount).toBe(6);
  });

  it("rejects an unapproved sixth positive", () => {
    expect(() =>
      parseGeneratedSiteVisualReferenceCorpus({
        ...corpusJson,
        accepted: [
          ...corpusJson.accepted,
          { ...corpusJson.accepted[0], gallery: "05" },
        ],
      }),
    ).toThrow("unapproved generated-site visual reference");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_COMPOSER_IMAGES,
  addAttachments,
  removeAttachment,
  revokeAll,
  type PendingAttachment,
} from "@/lib/projects/composer-attachments";

function file(name: string): File {
  return new File(["x"], name, { type: "image/png" });
}

const revoke = vi.fn();
URL.revokeObjectURL = revoke;

describe("composer attachments", () => {
  afterEach(() => revoke.mockClear());

  it("addAttachments appends up to the cap and reports overflow", () => {
    const first = addAttachments([], [file("a.png"), file("b.png")]);
    expect(first.next).toHaveLength(2);
    expect(first.rejected).toEqual([]);

    const fill = Array.from({ length: MAX_COMPOSER_IMAGES }, () =>
      file("x.png"),
    );
    const full = addAttachments([], fill);
    expect(full.next).toHaveLength(MAX_COMPOSER_IMAGES);
    expect(full.rejected).toEqual([]);

    const overflow = addAttachments(full.next, [file("extra.png")]);
    expect(overflow.next).toHaveLength(MAX_COMPOSER_IMAGES);
    expect(overflow.rejected).toHaveLength(1);
  });

  it("removeAttachment drops one and revokes its blob URL", () => {
    const base: PendingAttachment[] = [
      { blobUrl: "blob:1", file: file("a.png"), id: "1" },
      { blobUrl: "blob:2", file: file("b.png"), id: "2" },
    ];
    const next = removeAttachment(base, "1");
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("2");
    expect(revoke).toHaveBeenCalledWith("blob:1");
  });

  it("revokeAll revokes every blob URL", () => {
    revokeAll([
      { blobUrl: "blob:1", file: file("a.png"), id: "1" },
      { blobUrl: "blob:2", file: file("b.png"), id: "2" },
    ]);
    expect(revoke).toHaveBeenCalledTimes(2);
  });
});

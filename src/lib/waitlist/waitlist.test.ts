import { afterEach, describe, expect, it } from "vitest";

import {
  isAdminEmail,
  isWaitlistPendingStatus,
  normalizeEmail,
  parseWaitlistImageRefs,
  validateWaitlistStory,
  WAITLIST_PENDING_STATUSES,
} from "@/lib/waitlist/waitlist";

describe("waitlist", () => {
  it("defines the same pending set used by admin work queues", () => {
    expect(WAITLIST_PENDING_STATUSES).toEqual(["pending", "waitlisted"]);
    expect(isWaitlistPendingStatus("pending")).toBe(true);
    expect(isWaitlistPendingStatus("waitlisted")).toBe(true);
    expect(isWaitlistPendingStatus("approved")).toBe(false);
    expect(isWaitlistPendingStatus("rejected")).toBe(false);
  });

  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  describe("normalizeEmail", () => {
    it("lowercases and trims", () => {
      expect(normalizeEmail("  Owner@Example.COM ")).toBe("owner@example.com");
    });

    it("returns null for empty or malformed input", () => {
      expect(normalizeEmail("")).toBeNull();
      expect(normalizeEmail("   ")).toBeNull();
      expect(normalizeEmail("not-an-email")).toBeNull();
      expect(normalizeEmail("a@b")).toBeNull();
    });
  });

  describe("validateWaitlistStory", () => {
    it("rejects empty or too-short stories", () => {
      expect(validateWaitlistStory("").ok).toBe(false);
      expect(validateWaitlistStory("asdf").ok).toBe(false);
    });

    it("accepts a genuine-length story", () => {
      const story =
        "Kami jual kopi specialty dari petani lokal di Bandung, buka sejak 2019, fokus mahasiswa.";
      expect(validateWaitlistStory(story).ok).toBe(true);
    });

    it("returns the trimmed story on success", () => {
      const story = "  " + "a".repeat(120) + "  ";
      const result = validateWaitlistStory(story);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.story).toBe("a".repeat(120));
      }
    });
  });

  describe("parseWaitlistImageRefs", () => {
    it("parses JSON array of object refs", () => {
      expect(
        parseWaitlistImageRefs(
          JSON.stringify([
            "object:s3:waitlist/a.png",
            "object:s3:waitlist/b.jpg",
          ]),
        ),
      ).toEqual(["object:s3:waitlist/a.png", "object:s3:waitlist/b.jpg"]);
    });

    it("accepts legacy single-string JSON or raw object ref", () => {
      expect(parseWaitlistImageRefs('"object:s3:waitlist/a.png"')).toEqual([
        "object:s3:waitlist/a.png",
      ]);
      expect(parseWaitlistImageRefs("object:local:waitlist/a.png")).toEqual([
        "object:local:waitlist/a.png",
      ]);
    });

    it("returns empty for null or garbage", () => {
      expect(parseWaitlistImageRefs(null)).toEqual([]);
      expect(parseWaitlistImageRefs("not-json")).toEqual([]);
      expect(parseWaitlistImageRefs("[]")).toEqual([]);
    });
  });

  describe("isAdminEmail", () => {
    it("returns false when ADMIN_EMAILS is unset", () => {
      expect(isAdminEmail("anyone@example.com")).toBe(false);
    });

    it("matches an allowlisted email (case-insensitive, whitespace-tolerant)", () => {
      process.env.ADMIN_EMAILS = " Owner@Example.com , admin@umkmcepat.com ";
      expect(isAdminEmail("owner@example.com")).toBe(true);
      expect(isAdminEmail("OWNER@EXAMPLE.COM")).toBe(true);
      expect(isAdminEmail("admin@umkmcepat.com")).toBe(true);
    });

    it("returns false for non-allowlisted emails", () => {
      process.env.ADMIN_EMAILS = "owner@example.com";
      expect(isAdminEmail("random@example.com")).toBe(false);
      expect(isAdminEmail("")).toBe(false);
    });
  });
});

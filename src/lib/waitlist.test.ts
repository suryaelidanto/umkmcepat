import { afterEach, describe, expect, it } from "vitest";

import {
  isAdminEmail,
  normalizeEmail,
  validateWaitlistStory,
} from "@/lib/waitlist";

describe("waitlist", () => {
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

import { describe, expect, it } from "vitest";

import { mask } from "@/lib/mask";

describe("mask", () => {
  describe("email", () => {
    it("masks typical email", () => {
      expect(mask("suryaelidanto@gmail.com", "email")).toEqual({
        masked: "s•••@gmail.com",
        revealable: true,
      });
    });
    it("handles short localpart", () => {
      expect(mask("a@b.co", "email")).toEqual({
        masked: "a•••@b.co",
        revealable: true,
      });
    });
    it("returns em-dash for null/empty", () => {
      expect(mask(null, "email")).toEqual({ masked: "—", revealable: true });
      expect(mask(undefined, "email")).toEqual({
        masked: "—",
        revealable: true,
      });
      expect(mask("", "email")).toEqual({ masked: "—", revealable: true });
    });
  });

  describe("phone", () => {
    it("keeps first 3 and last 2 digits", () => {
      expect(mask("081234567890", "phone")).toEqual({
        masked: "081•••90",
        revealable: true,
      });
    });
    it("returns em-dash for too short", () => {
      expect(mask("081", "phone")).toEqual({ masked: "—", revealable: true });
    });
    it("returns em-dash for null", () => {
      expect(mask(null, "phone")).toEqual({ masked: "—", revealable: true });
    });
  });

  describe("name", () => {
    it("keeps first letter of first + last word", () => {
      expect(mask("Toko Sumber Rezeki", "name")).toEqual({
        masked: "T•••••R",
        revealable: true,
      });
    });
    it("handles single-word name", () => {
      expect(mask("Surya", "name")).toEqual({
        masked: "Su•••a",
        revealable: true,
      });
    });
    it("returns em-dash for null", () => {
      expect(mask(null, "name")).toEqual({ masked: "—", revealable: true });
    });
  });

  describe("orderId", () => {
    it("keeps prefix and last 2 chars", () => {
      expect(mask("INV-2026-07-15-000123", "orderId")).toEqual({
        masked: "INV-•••23",
        revealable: true,
      });
    });
    it("handles bare numeric", () => {
      expect(mask("1234567", "orderId")).toEqual({
        masked: "••••67",
        revealable: true,
      });
    });
    it("returns em-dash for null/short", () => {
      expect(mask(null, "orderId")).toEqual({ masked: "—", revealable: true });
      expect(mask("1", "orderId")).toEqual({ masked: "—", revealable: true });
    });
  });

  describe("amount", () => {
    it("returns full mask and not revealable", () => {
      expect(mask("Rp 25.000", "amount")).toEqual({
        masked: "••••••••",
        revealable: false,
      });
    });
    it("returns em-dash for null", () => {
      expect(mask(null, "amount")).toEqual({ masked: "—", revealable: false });
    });
  });

  it("uses kind default for revealable when value is em-dash", () => {
    // em-dash case still has revealable=true for all kinds except amount
    expect(mask(null, "amount").revealable).toBe(false);
    expect(mask(null, "email").revealable).toBe(true);
  });
});

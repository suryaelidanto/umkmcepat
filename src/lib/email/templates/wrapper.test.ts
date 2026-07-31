import { describe, it, expect } from "vitest";

import { escapeHtml, wrapEmail } from "@/lib/email/templates/wrapper";

describe("escapeHtml", () => {
  it("escapes & < > \" '", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#039;");
  });

  it("passes through safe strings", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });
});

describe("wrapEmail", () => {
  it("returns html and text with header/footer", () => {
    const result = wrapEmail("<p>Isi email</p>");
    expect(result.html).toContain("UMKM Cepat");
    expect(result.html).toContain("<p>Isi email</p>");
    expect(result.html).toContain("Mohon tidak membalas email ini");
    expect(result.html).toContain("max-width:640px");
    expect(result.html).toContain("padding:32px 40px");
    expect(result.html).toContain("padding:32px 16px");
    expect(result.text).toContain("Isi email");
    expect(result.text).toContain("Mohon tidak membalas email ini");
  });

  it("includes CTA button when provided", () => {
    const result = wrapEmail("<p>Test</p>", {
      cta: { text: "Klik Di Sini", url: "https://example.com" },
    });
    expect(result.html).toContain("Klik Di Sini");
    expect(result.html).toContain("https://example.com");
    expect(result.text).toContain("Klik Di Sini");
    expect(result.text).toContain("https://example.com");
  });

  it("does not include CTA section when not provided", () => {
    const result = wrapEmail("<p>Test</p>");
    // CTA button uses display:inline-block — footer only uses text-align:center
    expect(result.html).not.toContain("display:inline-block");
    expect(result.text).not.toContain("http");
  });
});

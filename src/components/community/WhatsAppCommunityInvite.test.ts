import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WhatsAppCommunityInvite } from "./WhatsAppCommunityInvite";

function render(variant: "homepage" | "waitlist") {
  return renderToStaticMarkup(
    createElement(WhatsAppCommunityInvite, { variant }),
  );
}

describe("WhatsAppCommunityInvite", () => {
  it("renders a secondary homepage invitation with a privacy disclosure", () => {
    const markup = render("homepage");

    expect(markup).toContain("Tempat ngobrol untuk pelaku UMKM");
    expect(markup).toContain("Join WhatsApp");
    expect(markup).not.toContain("Gabung Grup WhatsApp");
    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain(
      "Nomor WhatsApp kamu dapat terlihat oleh anggota grup.",
    );
    expect(markup).toContain("border");
  });

  it("renders the WhatsApp invitation as the primary waitlist action", () => {
    const markup = render("waitlist");

    expect(markup).toContain("Sambil menunggu, gabung obrolannya");
    expect(markup).toContain(
      "Kamu bisa bertanya dan kenalan dengan pelaku UMKM lainnya.",
    );
    expect(markup).toContain("Join WhatsApp");
    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain("bg-surface-warm-white");
  });
});

describe("WhatsApp discussion entry points", () => {
  const source = (relativePath: string) =>
    readFileSync(new URL(relativePath, import.meta.url), "utf8");

  it("places the invitation on the homepage and pending banner", () => {
    const homeSource = source("../../routes/_main.index.tsx");

    expect(homeSource).toContain(
      '<WhatsAppCommunityInvite variant="homepage" />',
    );
    expect(homeSource).toContain(
      '<Button asChild size="sm" variant="outline">',
    );
    expect(homeSource).toContain("Join WhatsApp");
  });

  it("places the primary invitation on the waitlist success screen", () => {
    const waitlistSource = source("../../routes/_main.waitlist.tsx");

    expect(waitlistSource).toContain(
      '<WhatsAppCommunityInvite variant="waitlist" />',
    );
  });

  it("separates the footer button from the plain navigation links", () => {
    const footerSource = source("../common/Footer.tsx");
    const navigation = footerSource.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? "";

    expect(footerSource).toContain(
      'className="flex flex-col items-start gap-spacing-4 md:items-end"',
    );
    expect(navigation).toContain("Ketentuan");
    expect(navigation).toContain("Privasi");
    expect(navigation).toContain("Github");
    expect(navigation).not.toContain("Join WhatsApp");
    expect(footerSource).toMatch(
      /<\/nav>\s*<Button asChild size="sm" variant="outline">/,
    );
    expect(footerSource).toContain("Join WhatsApp");
    expect(footerSource).toContain("WHATSAPP_UMKM_GROUP_URL");
  });
});

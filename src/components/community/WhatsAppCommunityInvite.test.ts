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
  it("renders the homepage community invitation", () => {
    const markup = render("homepage");

    expect(markup).toContain("Komunitas UMKM Cepat");
    expect(markup).toContain("Wadah ngobrol pelaku UMKM di UMKM Cepat.");
    expect(markup).not.toContain(
      "Nomor WhatsApp kamu dapat terlihat oleh anggota grup.",
    );
    expect(markup).toContain("Join WhatsApp");
    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain("border");
  });

  it("renders the WhatsApp invitation as the primary waitlist action", () => {
    const markup = render("waitlist");

    expect(markup).toContain("Sambil menunggu, gabung obrolannya");
    expect(markup).toContain("Join WhatsApp");
    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain("bg-surface-warm-white");
  });
});

describe("WhatsApp discussion entry points", () => {
  const source = (relativePath: string) =>
    readFileSync(new URL(relativePath, import.meta.url), "utf8");

  it("places the invitation on the homepage after FAQ without a pending-banner WhatsApp action", () => {
    const homeSource = source("../../routes/_main.index.tsx");
    const communitySectionIndex = homeSource.indexOf("<CommunitySection");
    const inviteIndex = homeSource.indexOf(
      '<WhatsAppCommunityInvite variant="homepage" />',
    );

    expect(communitySectionIndex).toBeGreaterThan(-1);
    expect(inviteIndex).toBeGreaterThan(communitySectionIndex);
    expect(homeSource).not.toContain("WHATSAPP_UMKM_GROUP_URL");
    expect(homeSource).not.toContain("isWaitingToBeApproved");
    expect(homeSource).not.toContain("Join WhatsApp");
  });

  it("places the primary invitation on the waitlist success screen", () => {
    const waitlistSource = source("../../routes/_main.waitlist.tsx");

    expect(waitlistSource).toContain(
      '<WhatsAppCommunityInvite variant="waitlist" />',
    );
  });

  it("lists the footer link", () => {
    const footerSource = source("../common/Footer.tsx");
    const navigation = footerSource.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? "";

    expect(navigation).toContain("Ketentuan");
    expect(navigation).toContain("Privasi");
    expect(footerSource).not.toContain('data-slot="button"');
  });
});

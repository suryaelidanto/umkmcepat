import { describe, expect, it } from "vitest";

import {
  resolveMobileNavModel,
  shouldRenderMobileNav,
} from "./mobile-nav-model";

describe("shouldRenderMobileNav", () => {
  it("renders only after authentication is established", () => {
    expect(shouldRenderMobileNav("loading")).toBe(false);
    expect(shouldRenderMobileNav("unauthenticated")).toBe(false);
    expect(shouldRenderMobileNav("authenticated")).toBe(true);
  });
});

describe("resolveMobileNavModel", () => {
  it("keeps approved users on primary home and account actions", () => {
    expect(
      resolveMobileNavModel({ isAdmin: false, waitlisted: false }),
    ).toEqual({
      overflow: [
        { href: "/privacy", label: "Privasi" },
        { href: "/terms", label: "Syarat" },
      ],
      primary: [
        { href: "/", label: "Beranda", icon: "home" },
        { href: "/profile", label: "Akun", icon: "account" },
      ],
    });
  });

  it("adds the admin menu without exposing an admin-projects shortcut", () => {
    expect(resolveMobileNavModel({ isAdmin: true, waitlisted: false })).toEqual(
      expect.objectContaining({
        overflow: [
          { href: "/privacy", label: "Privasi" },
          { href: "/terms", label: "Syarat" },
          { href: "/admin", label: "Admin" },
        ],
      }),
    );
  });

  it("keeps waitlisted users on the queue action", () => {
    expect(resolveMobileNavModel({ isAdmin: false, waitlisted: true })).toEqual(
      {
        overflow: [
          { href: "/privacy", label: "Privasi" },
          { href: "/terms", label: "Syarat" },
        ],
        primary: [
          { href: "/", label: "Beranda", icon: "home" },
          { href: "/waitlist", label: "Antrean", icon: "waitlist" },
        ],
      },
    );
  });
});

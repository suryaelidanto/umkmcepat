import { describe, expect, it } from "vitest";

import {
  shouldBlockMainChromeShell,
  shouldRedirectToVerify,
} from "./main-chrome-gate";

describe("shouldBlockMainChromeShell", () => {
  it("does not block guests", () => {
    expect(
      shouldBlockMainChromeShell({
        sessionStatus: "unauthenticated",
        verificationPending: true,
        verificationData: undefined,
        verificationSuccess: false,
      }),
    ).toBe(false);
  });

  it("does not block while session is still loading", () => {
    expect(
      shouldBlockMainChromeShell({
        sessionStatus: "loading",
        verificationPending: true,
        verificationData: undefined,
        verificationSuccess: false,
      }),
    ).toBe(false);
  });

  it("blocks authenticated users on first verification load", () => {
    expect(
      shouldBlockMainChromeShell({
        sessionStatus: "authenticated",
        verificationPending: true,
        verificationData: undefined,
        verificationSuccess: false,
      }),
    ).toBe(true);
  });

  it("blocks authenticated signed-in unverified users", () => {
    expect(
      shouldBlockMainChromeShell({
        sessionStatus: "authenticated",
        verificationPending: false,
        verificationData: { signedIn: true, verified: false },
        verificationSuccess: true,
      }),
    ).toBe(true);
  });

  it("does not block authenticated verified users", () => {
    expect(
      shouldBlockMainChromeShell({
        sessionStatus: "authenticated",
        verificationPending: false,
        verificationData: { signedIn: true, verified: true },
        verificationSuccess: true,
      }),
    ).toBe(false);
  });

  it("does not block authenticated users on verification error (no success data)", () => {
    expect(
      shouldBlockMainChromeShell({
        sessionStatus: "authenticated",
        verificationPending: false,
        verificationData: undefined,
        verificationSuccess: false,
      }),
    ).toBe(false);
  });

  it("does not block guest 401 payload (signedIn:false)", () => {
    expect(
      shouldBlockMainChromeShell({
        sessionStatus: "unauthenticated",
        verificationPending: false,
        verificationData: { signedIn: false, verified: false },
        verificationSuccess: true,
      }),
    ).toBe(false);
  });

  it("does not block session/API race (client authed, server 401)", () => {
    expect(
      shouldBlockMainChromeShell({
        sessionStatus: "authenticated",
        verificationPending: false,
        verificationData: { signedIn: false, verified: false },
        verificationSuccess: true,
      }),
    ).toBe(false);
  });
});

describe("shouldRedirectToVerify", () => {
  it("redirects only signed-in unverified authenticated users", () => {
    expect(
      shouldRedirectToVerify({
        sessionStatus: "authenticated",
        verificationPending: false,
        verificationData: { signedIn: true, verified: false },
        verificationSuccess: true,
      }),
    ).toBe(true);
  });

  it("does not redirect guests", () => {
    expect(
      shouldRedirectToVerify({
        sessionStatus: "unauthenticated",
        verificationPending: false,
        verificationData: { signedIn: false, verified: false },
        verificationSuccess: true,
      }),
    ).toBe(false);
  });

  it("does not redirect on session/API race", () => {
    expect(
      shouldRedirectToVerify({
        sessionStatus: "authenticated",
        verificationPending: false,
        verificationData: { signedIn: false, verified: false },
        verificationSuccess: true,
      }),
    ).toBe(false);
  });
});

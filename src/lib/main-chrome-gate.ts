export type SessionStatus = "authenticated" | "loading" | "unauthenticated";

export type VerificationGateData = {
  signedIn: boolean;
  verified: boolean;
};

export type VerificationGateInput = {
  sessionStatus: SessionStatus;
  verificationPending: boolean;
  verificationData: VerificationGateData | undefined;
  verificationSuccess: boolean;
};

/**
 * Full-page shell block for MainChrome.
 * Guests never block. Authenticated users wait on first verification (no cache)
 * and block when the server confirms signed-in + unverified.
 * A 401 (signedIn:false) does not force /verify — allow shell on that race.
 */
export function shouldBlockMainChromeShell(
  input: VerificationGateInput,
): boolean {
  if (input.sessionStatus !== "authenticated") {
    return false;
  }

  const firstLoadChecking =
    input.verificationPending && input.verificationData === undefined;
  const blockingUnverified =
    input.verificationSuccess &&
    input.verificationData?.signedIn === true &&
    input.verificationData.verified === false;

  return firstLoadChecking || blockingUnverified;
}

/** Redirect to /verify only when server confirms a signed-in unverified user. */
export function shouldRedirectToVerify(input: VerificationGateInput): boolean {
  return (
    input.sessionStatus === "authenticated" &&
    input.verificationSuccess &&
    input.verificationData?.signedIn === true &&
    input.verificationData.verified === false
  );
}

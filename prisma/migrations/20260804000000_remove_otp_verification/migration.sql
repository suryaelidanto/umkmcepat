-- Remove OTP verification. Drops only OTP-specific structures; preserves all
-- other user/auth/product data.

DROP TABLE IF EXISTS "OtpRequest";

DROP INDEX IF EXISTS "User_verifiedAt_idx";
DROP INDEX IF EXISTS "User_phone_key";

ALTER TABLE "User"
  DROP COLUMN IF EXISTS "phone",
  DROP COLUMN IF EXISTS "verifiedAt",
  DROP COLUMN IF EXISTS "otpAttempts",
  DROP COLUMN IF EXISTS "otpLockedUntil";

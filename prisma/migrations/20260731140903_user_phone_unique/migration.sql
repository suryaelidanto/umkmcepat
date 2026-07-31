-- Dedupe: keep oldest row per phone, clear others so unique can apply
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY phone
           ORDER BY "verifiedAt" ASC NULLS LAST, "createdAt" ASC
         ) AS rn
  FROM "User"
  WHERE phone IS NOT NULL
)
UPDATE "User" u
SET phone = NULL, "verifiedAt" = NULL
FROM ranked r
WHERE u.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

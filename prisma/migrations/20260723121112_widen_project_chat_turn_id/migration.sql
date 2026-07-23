-- Widen ProjectChatTurn.id from VARCHAR(32) to VARCHAR(64).
--
-- The id is generated as `ct_${randomUUID().replace(/-/g, "")}` = 35 chars
-- (3-char "ct_" prefix + 32 hex digits), which exceeded VARCHAR(32) and
-- raised Prisma P2000 ("The provided value for the column is too long for
-- the column's type"). VARCHAR(64) matches the sibling userMessageId column
-- and leaves headroom for the `ct_` prefix plus a full 32-hex uuid.
ALTER TABLE "ProjectChatTurn" ALTER COLUMN "id" TYPE VARCHAR(64);

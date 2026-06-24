ALTER TABLE "Project" ADD COLUMN "chatSummary" JSONB;
ALTER TABLE "Project" ADD COLUMN "memoryFacts" JSONB;
ALTER TABLE "Project" ADD COLUMN "lastCompactedMessageCount" INTEGER NOT NULL DEFAULT 0;

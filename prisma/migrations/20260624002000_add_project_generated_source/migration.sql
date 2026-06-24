ALTER TABLE "Project" ADD COLUMN "sourceFiles" JSONB;
ALTER TABLE "Project" ADD COLUMN "buildStatus" VARCHAR(32) NOT NULL DEFAULT 'not_started';
ALTER TABLE "Project" ADD COLUMN "buildLog" TEXT;
ALTER TABLE "Project" ADD COLUMN "builtAt" TIMESTAMP(3);

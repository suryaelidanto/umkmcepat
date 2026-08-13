ALTER TABLE "ProjectBuildHandoff"
  ADD COLUMN "briefSnapshot" JSONB,
  ADD COLUMN "briefHash" VARCHAR(64),
  ADD COLUMN "briefRevision" INTEGER;

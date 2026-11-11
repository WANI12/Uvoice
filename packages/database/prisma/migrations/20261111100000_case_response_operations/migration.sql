ALTER TABLE "CaseAssignment" ADD COLUMN "dueAt" TIMESTAMP(3);

ALTER TABLE "Verification"
  ADD COLUMN "evidenceSummary" TEXT,
  ADD COLUMN "sources" TEXT;

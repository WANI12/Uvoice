ALTER TYPE "UserRole" ADD VALUE 'EXECUTIVE';

CREATE TYPE "RecommendationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "ExecutiveRecommendation" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "stateCode" TEXT,
    "countyCode" TEXT,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNotes" TEXT,
    "createdById" UUID NOT NULL,
    "reviewedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "ExecutiveRecommendation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExecutiveRecommendation_status_createdAt_idx" ON "ExecutiveRecommendation"("status", "createdAt");
CREATE INDEX "ExecutiveRecommendation_stateCode_countyCode_idx" ON "ExecutiveRecommendation"("stateCode", "countyCode");

ALTER TABLE "ExecutiveRecommendation" ADD CONSTRAINT "ExecutiveRecommendation_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExecutiveRecommendation" ADD CONSTRAINT "ExecutiveRecommendation_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

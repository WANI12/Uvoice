CREATE TYPE "EarlyWarningStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'DISMISSED');
CREATE TYPE "WarningChannel" AS ENUM ('IN_APP', 'EMAIL');
CREATE TYPE "WarningDeliveryStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "EarlyWarningAlert" (
    "id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "severity" "RiskLevel" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "stateCode" TEXT,
    "countyCode" TEXT,
    "category" TEXT,
    "caseId" UUID,
    "details" JSONB,
    "status" "EarlyWarningStatus" NOT NULL DEFAULT 'OPEN',
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EarlyWarningAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WarningNotification" (
    "id" UUID NOT NULL,
    "alertId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "channel" "WarningChannel" NOT NULL,
    "status" "WarningDeliveryStatus" NOT NULL,
    "error" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WarningNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EarlyWarningBulletin" (
    "id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "content" JSONB NOT NULL,
    "generatedById" UUID,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EarlyWarningBulletin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EarlyWarningAlert_fingerprint_key" ON "EarlyWarningAlert"("fingerprint");
CREATE INDEX "EarlyWarningAlert_status_severity_createdAt_idx" ON "EarlyWarningAlert"("status", "severity", "createdAt");
CREATE INDEX "EarlyWarningAlert_ruleCode_createdAt_idx" ON "EarlyWarningAlert"("ruleCode", "createdAt");
CREATE INDEX "EarlyWarningAlert_caseId_ruleCode_idx" ON "EarlyWarningAlert"("caseId", "ruleCode");
CREATE UNIQUE INDEX "WarningNotification_alertId_recipientId_channel_key" ON "WarningNotification"("alertId", "recipientId", "channel");
CREATE INDEX "WarningNotification_recipientId_createdAt_idx" ON "WarningNotification"("recipientId", "createdAt");
CREATE UNIQUE INDEX "EarlyWarningBulletin_period_periodStart_key" ON "EarlyWarningBulletin"("period", "periodStart");
CREATE INDEX "EarlyWarningBulletin_generatedAt_idx" ON "EarlyWarningBulletin"("generatedAt");

ALTER TABLE "EarlyWarningAlert" ADD CONSTRAINT "EarlyWarningAlert_acknowledgedById_fkey"
  FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EarlyWarningAlert" ADD CONSTRAINT "EarlyWarningAlert_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "ElectionCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WarningNotification" ADD CONSTRAINT "WarningNotification_alertId_fkey"
  FOREIGN KEY ("alertId") REFERENCES "EarlyWarningAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WarningNotification" ADD CONSTRAINT "WarningNotification_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EarlyWarningBulletin" ADD CONSTRAINT "EarlyWarningBulletin_generatedById_fkey"
  FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

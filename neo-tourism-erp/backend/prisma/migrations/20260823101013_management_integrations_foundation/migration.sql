-- CreateEnum
CREATE TYPE "IntegrationProviderType" AS ENUM ('WISE', 'BANK', 'TELEPHONY', 'WEBSITE', 'OTHER');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('NOT_CONFIGURED', 'CONNECTED', 'DEGRADED', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "IntegrationEventDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "IntegrationEventStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('INITIATED', 'RINGING', 'ANSWERED', 'MISSED', 'FAILED', 'COMPLETED');

-- CreateTable
CREATE TABLE "IntegrationProvider" (
    "id" UUID NOT NULL,
    "type" "IntegrationProviderType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "lastCheckedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationEvent" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "direction" "IntegrationEventDirection" NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalReference" TEXT,
    "internalEntityType" TEXT,
    "internalEntityId" TEXT,
    "status" "IntegrationEventStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallLog" (
    "id" UUID NOT NULL,
    "leadId" UUID,
    "customerId" UUID,
    "userId" UUID NOT NULL,
    "direction" "CallDirection" NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "externalCallId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "status" "CallStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationProvider_status_isEnabled_idx" ON "IntegrationProvider"("status", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationProvider_type_name_key" ON "IntegrationProvider"("type", "name");

-- CreateIndex
CREATE INDEX "IntegrationEvent_providerId_status_createdAt_idx" ON "IntegrationEvent"("providerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationEvent_internalEntityType_internalEntityId_idx" ON "IntegrationEvent"("internalEntityType", "internalEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationEvent_providerId_eventType_externalReference_key" ON "IntegrationEvent"("providerId", "eventType", "externalReference");

-- CreateIndex
CREATE INDEX "CallLog_leadId_createdAt_idx" ON "CallLog"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "CallLog_customerId_createdAt_idx" ON "CallLog"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CallLog_userId_createdAt_idx" ON "CallLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CallLog_externalCallId_idx" ON "CallLog"("externalCallId");

-- CreateIndex
CREATE INDEX "ITTicket_status_priority_createdAt_idx" ON "ITTicket"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "Reconciliation_status_updatedAt_idx" ON "Reconciliation"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IntegrationProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

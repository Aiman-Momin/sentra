-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('NORMAL', 'SUSPICIOUS', 'HIGH_RISK', 'ACTIVE_SWEEPER_LIKELY');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('FAST_DRAIN_DETECTED', 'RISK_SCORE_INCREASED', 'NEW_REPEATED_DESTINATION');

-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "recommendation" TEXT NOT NULL,
    "signals" JSONB NOT NULL,
    "timeline" JSONB NOT NULL,
    "insufficientData" BOOLEAN NOT NULL DEFAULT false,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoredWallet" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3),
    "lastRiskScore" INTEGER,
    "lastRiskLevel" "RiskLevel",

    CONSTRAINT "MonitoredWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "monitoredWalletId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "message" TEXT NOT NULL,
    "previousScore" INTEGER,
    "newScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiskAssessment_address_network_analyzedAt_idx" ON "RiskAssessment"("address", "network", "analyzedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoredWallet_address_network_key" ON "MonitoredWallet"("address", "network");

-- CreateIndex
CREATE INDEX "Alert_monitoredWalletId_createdAt_idx" ON "Alert"("monitoredWalletId", "createdAt");

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_monitoredWalletId_fkey" FOREIGN KEY ("monitoredWalletId") REFERENCES "MonitoredWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

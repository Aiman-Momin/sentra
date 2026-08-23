-- CreateTable
CREATE TABLE "SweeperFingerprint" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "avgDrainDelaySeconds" DOUBLE PRECISION NOT NULL,
    "avgDrainPercentage" DOUBLE PRECISION NOT NULL,
    "gasFundingRatio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "preferredAssets" JSONB NOT NULL,
    "activeHoursUtc" JSONB NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SweeperFingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SweeperFingerprintMatch" (
    "id" TEXT NOT NULL,
    "fingerprintId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "similarityScore" DOUBLE PRECISION NOT NULL,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SweeperFingerprintMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SweeperFingerprint_label_key" ON "SweeperFingerprint"("label");

-- CreateIndex
CREATE INDEX "SweeperFingerprint_network_idx" ON "SweeperFingerprint"("network");

-- CreateIndex
CREATE INDEX "SweeperFingerprintMatch_fingerprintId_idx" ON "SweeperFingerprintMatch"("fingerprintId");

-- CreateIndex
CREATE UNIQUE INDEX "SweeperFingerprintMatch_fingerprintId_address_network_key" ON "SweeperFingerprintMatch"("fingerprintId", "address", "network");

-- AddForeignKey
ALTER TABLE "SweeperFingerprintMatch" ADD CONSTRAINT "SweeperFingerprintMatch_fingerprintId_fkey" FOREIGN KEY ("fingerprintId") REFERENCES "SweeperFingerprint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

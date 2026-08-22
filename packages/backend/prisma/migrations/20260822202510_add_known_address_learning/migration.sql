-- CreateEnum
CREATE TYPE "AddressClassification" AS ENUM ('SWEEPER_DESTINATION', 'VERIFIED_SAFE');

-- CreateEnum
CREATE TYPE "LearningSource" AS ENUM ('AUTO_LEARNED', 'MANUAL');

-- CreateTable
CREATE TABLE "KnownAddress" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "classification" "AddressClassification" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "source" "LearningSource" NOT NULL,
    "note" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnownAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnownAddress_network_classification_idx" ON "KnownAddress"("network", "classification");

-- CreateIndex
CREATE UNIQUE INDEX "KnownAddress_address_network_key" ON "KnownAddress"("address", "network");

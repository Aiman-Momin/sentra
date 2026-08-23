-- Add explicit human confirmation state to unique fingerprint-wallet matches.
ALTER TABLE "SweeperFingerprintMatch"
ADD COLUMN "confirmed" BOOLEAN NOT NULL DEFAULT false;

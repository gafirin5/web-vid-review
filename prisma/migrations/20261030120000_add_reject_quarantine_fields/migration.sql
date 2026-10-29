-- AlterTable
ALTER TABLE "Media" ADD COLUMN "rejectCategory" TEXT;
ALTER TABLE "Media" ADD COLUMN "rejectReason" TEXT;
ALTER TABLE "Media" ADD COLUMN "rejectedAt" DATETIME;
ALTER TABLE "Media" ADD COLUMN "quarantinedPath" TEXT;
ALTER TABLE "Media" ADD COLUMN "previousStoragePath" TEXT;

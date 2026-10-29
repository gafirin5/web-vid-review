-- AlterTable
ALTER TABLE "Media" ADD COLUMN "contentId" TEXT;
ALTER TABLE "Media" ADD COLUMN "reviewKind" TEXT;
ALTER TABLE "Media" ADD COLUMN "characterName" TEXT;
ALTER TABLE "Media" ADD COLUMN "reviewNote" TEXT;
ALTER TABLE "Media" ADD COLUMN "reviewedAt" DATETIME;

-- CreateIndex
CREATE UNIQUE INDEX "Media_contentId_key" ON "Media"("contentId");
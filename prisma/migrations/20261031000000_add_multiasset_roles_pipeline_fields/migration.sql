-- AlterTable: contentId tidak lagi unik global (multi-aset per CID)
DROP INDEX "Media_contentId_key";

-- AlterTable: field pipeline & multi-role
ALTER TABLE "Media" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'video';
ALTER TABLE "Media" ADD COLUMN "index" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Media" ADD COLUMN "characterCandidates" TEXT;
ALTER TABLE "Media" ADD COLUMN "game" TEXT;
ALTER TABLE "Media" ADD COLUMN "creatorName" TEXT;
ALTER TABLE "Media" ADD COLUMN "creatorSecUid" TEXT;
ALTER TABLE "Media" ADD COLUMN "sourceUrl" TEXT;
ALTER TABLE "Media" ADD COLUMN "sourcePlatform" TEXT;
ALTER TABLE "Media" ADD COLUMN "playlistId" TEXT;
ALTER TABLE "Media" ADD COLUMN "pinterestBoard" TEXT;
ALTER TABLE "Media" ADD COLUMN "visionVerdict" TEXT;
ALTER TABLE "Media" ADD COLUMN "pipelineStage" TEXT NOT NULL DEFAULT 'intake';
ALTER TABLE "Media" ADD COLUMN "externalRefs" TEXT;
ALTER TABLE "Media" ADD COLUMN "publishedAt" DATETIME;
ALTER TABLE "Media" ADD COLUMN "purgeAt" DATETIME;
ALTER TABLE "Media" ADD COLUMN "phash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Media_contentId_role_index_key" ON "Media"("contentId", "role", "index");
CREATE INDEX "Media_contentId_idx" ON "Media"("contentId");
CREATE INDEX "Media_role_idx" ON "Media"("role");
CREATE INDEX "Media_game_idx" ON "Media"("game");
CREATE INDEX "Media_characterName_idx" ON "Media"("characterName");
CREATE INDEX "Media_pipelineStage_idx" ON "Media"("pipelineStage");
CREATE INDEX "Media_purgeAt_idx" ON "Media"("purgeAt");

-- Backfill pipelineStage dari status lama
UPDATE "Media" SET "pipelineStage" = CASE "status"
    WHEN 'PENDING_REVIEW' THEN 'intake'
    WHEN 'APPROVED' THEN 'gated'
    WHEN 'REJECTED' THEN 'archived'
    WHEN 'ARCHIVED' THEN 'archived'
    ELSE 'intake'
  END;

-- Migrasi nilai rejectCategory lama ke enum pipeline
UPDATE "Media" SET "rejectCategory" = CASE "rejectCategory"
    WHEN 'dirty_video' THEN 'DIRTY_TEXT'
    WHEN 'skit' THEN 'SKIT'
    WHEN 'lowres' THEN 'LOWRES'
    WHEN 'other' THEN 'NON_COSPLAY'
    ELSE "rejectCategory"
  END
WHERE "rejectCategory" IS NOT NULL;

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "game" TEXT,
    "aliases" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Character_name_game_key" ON "Character"("name", "game");
CREATE INDEX "Character_name_idx" ON "Character"("name");
CREATE INDEX "Character_game_idx" ON "Character"("game");

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Game_name_key" ON "Game"("name");

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "role" TEXT NOT NULL PRIMARY KEY,
    "retentionDays" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "RetentionPolicy" ("role", "retentionDays", "updatedAt") VALUES
  ('video', 180, CURRENT_TIMESTAMP),
  ('cover', 90, CURRENT_TIMESTAMP),
  ('frame', 14, CURRENT_TIMESTAMP),
  ('pin', 30, CURRENT_TIMESTAMP),
  ('thumb', 90, CURRENT_TIMESTAMP),
  ('rejected', 90, CURRENT_TIMESTAMP);

-- CreateTable
CREATE TABLE "MediaAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mediaId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "actorType" TEXT NOT NULL,
    "actorName" TEXT,
    "agentId" TEXT,
    "reasonCode" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaAudit_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MediaAudit_mediaId_idx" ON "MediaAudit"("mediaId");
CREATE INDEX "MediaAudit_createdAt_idx" ON "MediaAudit"("createdAt");

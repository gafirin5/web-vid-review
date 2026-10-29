-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Media" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mediaType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "nsfwFlag" BOOLEAN NOT NULL DEFAULT false,
    "originalFileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "thumbnailPath" TEXT,
    "previewPath" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "durationSeconds" REAL,
    "width" INTEGER,
    "height" INTEGER,
    "fileHash" TEXT NOT NULL,
    "prompt" TEXT,
    "negativePrompt" TEXT,
    "generationParams" TEXT,
    "transcript" TEXT,
    "hasAudio" BOOLEAN NOT NULL DEFAULT false,
    "autoTagged" BOOLEAN NOT NULL DEFAULT false,
    "agentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Media_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Media" ("agentId", "createdAt", "description", "durationSeconds", "fileHash", "generationParams", "height", "id", "mediaType", "mimeType", "negativePrompt", "nsfwFlag", "originalFileName", "previewPath", "prompt", "sizeBytes", "status", "storagePath", "thumbnailPath", "title", "width") SELECT "agentId", "createdAt", "description", "durationSeconds", "fileHash", "generationParams", "height", "id", "mediaType", "mimeType", "negativePrompt", "nsfwFlag", "originalFileName", "previewPath", "prompt", "sizeBytes", "status", "storagePath", "thumbnailPath", "title", "width" FROM "Media";
DROP TABLE "Media";
ALTER TABLE "new_Media" RENAME TO "Media";
CREATE INDEX "Media_mediaType_idx" ON "Media"("mediaType");
CREATE INDEX "Media_createdAt_idx" ON "Media"("createdAt");
CREATE INDEX "Media_agentId_idx" ON "Media"("agentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

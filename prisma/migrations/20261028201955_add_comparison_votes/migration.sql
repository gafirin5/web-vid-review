-- CreateTable
CREATE TABLE "ComparisonVote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "winnerId" TEXT NOT NULL,
    "loserId" TEXT NOT NULL,
    "voterName" TEXT NOT NULL DEFAULT 'Anonymous',
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComparisonVote_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "Media" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ComparisonVote_loserId_fkey" FOREIGN KEY ("loserId") REFERENCES "Media" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ComparisonVote_winnerId_idx" ON "ComparisonVote"("winnerId");

-- CreateIndex
CREATE INDEX "ComparisonVote_loserId_idx" ON "ComparisonVote"("loserId");

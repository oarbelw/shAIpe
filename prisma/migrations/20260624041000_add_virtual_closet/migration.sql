-- AlterTable
ALTER TABLE "TryOn" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'single';

-- CreateTable
CREATE TABLE "ClosetItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tryOnId" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClosetItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClosetItem_tryOnId_fkey" FOREIGN KEY ("tryOnId") REFERENCES "TryOn" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutfitTryOnItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "outfitTryOnId" TEXT NOT NULL,
    "closetItemId" TEXT NOT NULL,
    CONSTRAINT "OutfitTryOnItem_outfitTryOnId_fkey" FOREIGN KEY ("outfitTryOnId") REFERENCES "TryOn" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OutfitTryOnItem_closetItemId_fkey" FOREIGN KEY ("closetItemId") REFERENCES "ClosetItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ClosetItem_tryOnId_key" ON "ClosetItem"("tryOnId");

-- CreateIndex
CREATE UNIQUE INDEX "OutfitTryOnItem_outfitTryOnId_closetItemId_key" ON "OutfitTryOnItem"("outfitTryOnId", "closetItemId");

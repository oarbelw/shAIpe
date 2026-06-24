-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TryOn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "productId" TEXT,
    "selectedSize" TEXT,
    "selectedColor" TEXT,
    "userNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "generatedImages" TEXT NOT NULL DEFAULT '[]',
    "fitPrediction" TEXT,
    "recommendedSize" TEXT,
    "confidence" REAL,
    "fitExplanation" TEXT,
    "fitWarnings" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "parentId" TEXT,
    "variationPrompt" TEXT,
    CONSTRAINT "TryOn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TryOn_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TryOn_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TryOn" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TryOn" ("confidence", "createdAt", "fitExplanation", "fitPrediction", "fitWarnings", "generatedImages", "id", "productId", "recommendedSize", "selectedColor", "selectedSize", "status", "updatedAt", "userId", "userNotes") SELECT "confidence", "createdAt", "fitExplanation", "fitPrediction", "fitWarnings", "generatedImages", "id", "productId", "recommendedSize", "selectedColor", "selectedSize", "status", "updatedAt", "userId", "userNotes" FROM "TryOn";
DROP TABLE "TryOn";
ALTER TABLE "new_TryOn" RENAME TO "TryOn";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "age" INTEGER,
    "sex" TEXT,
    "heightCm" REAL,
    "weightKg" REAL,
    "bodyType" TEXT,
    "preferredFit" TEXT,
    "braSize" TEXT,
    "jeanSize" TEXT,
    "pantWaist" TEXT,
    "pantInseam" TEXT,
    "dressSize" TEXT,
    "shoeSize" TEXT,
    "underwearSize" TEXT,
    "shirtSize" TEXT,
    "jacketSize" TEXT,
    "bustCm" REAL,
    "waistCm" REAL,
    "hipsCm" REAL,
    "shoulderWidthCm" REAL,
    "fitNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserImage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT,
    "brand" TEXT,
    "title" TEXT NOT NULL,
    "price" TEXT,
    "currency" TEXT,
    "description" TEXT,
    "category" TEXT,
    "images" TEXT NOT NULL DEFAULT '[]',
    "availableSizes" TEXT NOT NULL DEFAULT '[]',
    "colors" TEXT NOT NULL DEFAULT '[]',
    "material" TEXT,
    "fitDescription" TEXT,
    "modelInfo" TEXT,
    "reviewsSummary" TEXT,
    "rawScrapedText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TryOn" (
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
    CONSTRAINT "TryOn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TryOn_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

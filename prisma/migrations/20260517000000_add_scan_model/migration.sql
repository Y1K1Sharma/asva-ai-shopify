-- CreateTable
CREATE TABLE "Scan" (
    "shop" TEXT NOT NULL,
    "score" INTEGER,
    "grade" TEXT,
    "scanResponseJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("shop")
);

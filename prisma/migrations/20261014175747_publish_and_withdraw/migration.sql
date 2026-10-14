-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "publishedUrl" TEXT,
ADD COLUMN     "withdrawnAt" TIMESTAMP(3);

/*
  Warnings:

  - You are about to drop the column `discountPercent` on the `PromoCode` table. All the data in the column will be lost.
  - Added the required column `discountValue` to the `PromoCode` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PromoCode" DROP COLUMN "discountPercent",
ADD COLUMN     "discountType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
ADD COLUMN     "discountValue" DOUBLE PRECISION NOT NULL;

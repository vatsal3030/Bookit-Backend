-- AlterEnum
ALTER TYPE "ApptStatus" ADD VALUE 'RESCHEDULED';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "rescheduleAllowed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rescheduleReason" TEXT,
ADD COLUMN     "rescheduledFrom" TEXT;

-- AlterTable
ALTER TABLE "TimeSlot" ADD COLUMN     "description" TEXT,
ADD COLUMN     "serviceId" TEXT,
ADD COLUMN     "title" TEXT;

-- AddForeignKey
ALTER TABLE "TimeSlot" ADD CONSTRAINT "TimeSlot_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

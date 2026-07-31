-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "availabilitySlotId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "bookings_availabilitySlotId_key" ON "bookings"("availabilitySlotId");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_availabilitySlotId_fkey" FOREIGN KEY ("availabilitySlotId") REFERENCES "availabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

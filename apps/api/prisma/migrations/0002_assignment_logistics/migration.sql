-- Add per-person logistics overrides to event assignments.
ALTER TABLE "EventAssignment" ADD COLUMN "travelMode" TEXT;
ALTER TABLE "EventAssignment" ADD COLUMN "usesVan" BOOLEAN;
ALTER TABLE "EventAssignment" ADD COLUMN "departureAt" TIMESTAMP(3);
ALTER TABLE "EventAssignment" ADD COLUMN "arrivalAt" TIMESTAMP(3);
ALTER TABLE "EventAssignment" ADD COLUMN "logisticsNotes" TEXT;

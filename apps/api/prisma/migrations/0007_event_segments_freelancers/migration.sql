CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "gearNotes" TEXT;
ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "kind" TEXT;
ALTER TABLE "EventAssignment" ADD COLUMN IF NOT EXISTS "segmentId" TEXT;

CREATE TABLE IF NOT EXISTS "EventScheduleSegment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventScheduleSegment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EventScheduleSegment_eventId_type_idx" ON "EventScheduleSegment"("eventId", "type");
CREATE INDEX IF NOT EXISTS "EventScheduleSegment_startsAt_endsAt_idx" ON "EventScheduleSegment"("startsAt", "endsAt");
CREATE INDEX IF NOT EXISTS "EventAssignment_segmentId_idx" ON "EventAssignment"("segmentId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventScheduleSegment_eventId_fkey'
  ) THEN
    ALTER TABLE "EventScheduleSegment"
    ADD CONSTRAINT "EventScheduleSegment_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventAssignment_segmentId_fkey'
  ) THEN
    ALTER TABLE "EventAssignment"
    ADD CONSTRAINT "EventAssignment_segmentId_fkey"
    FOREIGN KEY ("segmentId") REFERENCES "EventScheduleSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "FreelanceContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreelanceContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FreelanceContact_tenantId_name_idx" ON "FreelanceContact"("tenantId", "name");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FreelanceContact_tenantId_fkey'
  ) THEN
    ALTER TABLE "FreelanceContact"
    ADD CONSTRAINT "FreelanceContact_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "EventScheduleSegment" ("id", "eventId", "type", "startsAt", "endsAt", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."id", 'bolo', e."startsAt", e."endsAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Event" e
WHERE NOT EXISTS (
  SELECT 1 FROM "EventScheduleSegment" s
  WHERE s."eventId" = e."id" AND s."type" = 'bolo'
);

UPDATE "EventAssignment" a
SET "segmentId" = s."id"
FROM "EventScheduleSegment" s
WHERE a."eventId" = s."eventId"
  AND s."type" = 'bolo'
  AND a."segmentId" IS NULL;

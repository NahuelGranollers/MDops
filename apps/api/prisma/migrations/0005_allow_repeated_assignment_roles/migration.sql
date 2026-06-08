-- Allow a person to have multiple assignment blocks with the same role inside
-- the same event, for example mount now and pickup/teardown the next day.
DROP INDEX IF EXISTS "EventAssignment_eventId_userId_role_key";

CREATE INDEX IF NOT EXISTS "EventAssignment_eventId_userId_role_idx"
ON "EventAssignment"("eventId", "userId", "role");

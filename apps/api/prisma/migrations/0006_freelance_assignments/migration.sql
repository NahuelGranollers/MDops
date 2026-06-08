ALTER TABLE "EventAssignment" ADD COLUMN IF NOT EXISTS "externalName" TEXT;
ALTER TABLE "EventAssignment" ADD COLUMN IF NOT EXISTS "externalPhone" TEXT;

ALTER TABLE "EventAssignment" DROP CONSTRAINT IF EXISTS "EventAssignment_userId_fkey";
ALTER TABLE "EventAssignment" ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "EventAssignment"
ADD CONSTRAINT "EventAssignment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

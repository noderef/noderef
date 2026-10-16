-- Add capability profile JSON. Existing isAdmin values are left unchanged.
-- NULL capabilities means the profile has never been resolved.
ALTER TABLE "server" ADD COLUMN "capabilities" TEXT;

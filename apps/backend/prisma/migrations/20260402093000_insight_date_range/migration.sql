-- Add per-server persisted insights date range preference
ALTER TABLE "server" ADD COLUMN "insightRangeDays" INTEGER NOT NULL DEFAULT 7;

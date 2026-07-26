ALTER TABLE "lawyers" ADD COLUMN "onboarding_state" text DEFAULT 'sem_sync' NOT NULL;--> statement-breakpoint
ALTER TABLE "lawyers" ADD COLUMN "first_sync_completed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "lawyers" SET "onboarding_state" = 'pronto', "first_sync_completed_at" = "last_synced_at" WHERE "last_synced_at" IS NOT NULL;

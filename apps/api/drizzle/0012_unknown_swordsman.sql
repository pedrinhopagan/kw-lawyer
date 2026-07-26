ALTER TABLE "deadlines" ALTER COLUMN "status" SET DEFAULT 'pendente';--> statement-breakpoint
ALTER TABLE "deadlines" ADD COLUMN "rescheduled_at" timestamp with time zone;--> statement-breakpoint
UPDATE "deadlines" SET "status" = 'pendente' WHERE "status" IN ('a_confirmar', 'confirmado');

ALTER TABLE "cases" ADD COLUMN "state" text DEFAULT 'tramitando' NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "state_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "kind" text DEFAULT 'incremental' NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "phase" text DEFAULT 'descoberta' NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "step_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "step_done" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "case_lawyers_lawyer_case_idx" ON "case_lawyers" USING btree ("lawyer_id","case_id");--> statement-breakpoint
CREATE INDEX "cases_last_movement_cnj_idx" ON "cases" USING btree ("last_movement_at" DESC NULLS LAST,"cnj_number");--> statement-breakpoint
CREATE INDEX "cases_tribunal_idx" ON "cases" USING btree ("tribunal");--> statement-breakpoint
CREATE INDEX "sessions_lawyer_idx" ON "sessions" USING btree ("lawyer_id");--> statement-breakpoint
CREATE INDEX "sync_runs_lawyer_started_idx" ON "sync_runs" USING btree ("lawyer_id","started_at" DESC NULLS LAST);--> statement-breakpoint
UPDATE "sync_runs" SET "phase" = "status" WHERE "status" <> 'em_execucao';

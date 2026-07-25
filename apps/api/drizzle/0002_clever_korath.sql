ALTER TABLE "publications" DROP CONSTRAINT "publications_source_content_hash_unique";--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "grau" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "org_judging_name" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "org_judging_code" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "subjects" jsonb;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "system_name" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "filed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "secrecy_level" integer;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "datajud_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "datajud_status" text;--> statement-breakpoint
ALTER TABLE "movements" ADD COLUMN "external_code" text;--> statement-breakpoint
ALTER TABLE "movements" ADD COLUMN "complements" jsonb;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "cases_enriched" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "movements_created" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "publication_links_lawyer_id_read_at_idx" ON "publication_links" USING btree ("lawyer_id","read_at");--> statement-breakpoint
CREATE INDEX "publications_content_hash_idx" ON "publications" USING btree ("content_hash");--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_case_source_external_code_occurred_at_unique" UNIQUE("case_id","source","external_code","occurred_at");
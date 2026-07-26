CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "djen_communication_oabs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"communication_id" uuid NOT NULL,
	"oab_number" text NOT NULL,
	"oab_uf" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "djen_communication_oabs_communication_id_oab_number_oab_uf_unique" UNIQUE("communication_id","oab_number","oab_uf")
);
--> statement-breakpoint
CREATE TABLE "djen_communications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"available_at" date,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"run_id" uuid,
	"projected_at" timestamp with time zone,
	"projector_version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "djen_communications_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "org_code" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "communication_number" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "canceled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "djen_hash" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "normalizer_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "djen_communication_oabs" ADD CONSTRAINT "djen_communication_oabs_communication_id_djen_communications_id_fk" FOREIGN KEY ("communication_id") REFERENCES "public"."djen_communications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "djen_communications" ADD CONSTRAINT "djen_communications_run_id_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."sync_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "djen_communication_oabs_oab_idx" ON "djen_communication_oabs" USING btree ("oab_number","oab_uf");--> statement-breakpoint
CREATE INDEX "djen_communications_available_at_idx" ON "djen_communications" USING btree ("available_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "djen_communications_pending_idx" ON "djen_communications" USING btree ("projector_version","available_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "updated" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_source_id_djen_communications_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."djen_communications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publications_source_id_idx" ON "publications" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "publications_text_plain_trgm_idx" ON "publications" USING gin ("text_plain" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "publications_org_name_trgm_idx" ON "publications" USING gin ("org_name" gin_trgm_ops);
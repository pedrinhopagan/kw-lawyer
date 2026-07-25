CREATE TABLE "case_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"movement_id" uuid NOT NULL,
	"publication_id" uuid,
	"decided_at" timestamp with time zone NOT NULL,
	"species" text NOT NULL,
	"outcome" text,
	"effects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"snippet" text NOT NULL,
	"confidence" text DEFAULT 'baixa' NOT NULL,
	"origin" text DEFAULT 'automatico' NOT NULL,
	"note" text,
	"dismissed_at" timestamp with time zone,
	"engine_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_decisions_movement_id_unique" UNIQUE("movement_id")
);
--> statement-breakpoint
CREATE TABLE "case_scans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"scanner" text NOT NULL,
	"engine_version" integer NOT NULL,
	"stats" jsonb,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_scans_case_scanner_unique" UNIQUE("case_id","scanner")
);
--> statement-breakpoint
ALTER TABLE "case_decisions" ADD CONSTRAINT "case_decisions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_decisions" ADD CONSTRAINT "case_decisions_movement_id_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_decisions" ADD CONSTRAINT "case_decisions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_scans" ADD CONSTRAINT "case_scans_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_decisions_case_decided_idx" ON "case_decisions" USING btree ("case_id","decided_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "case_decisions_case_species_idx" ON "case_decisions" USING btree ("case_id","species");
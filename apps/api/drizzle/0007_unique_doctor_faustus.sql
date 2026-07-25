CREATE TABLE "case_evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"movement_id" uuid NOT NULL,
	"publication_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"stage" text NOT NULL,
	"produced_by" text DEFAULT 'indefinido' NOT NULL,
	"title" text NOT NULL,
	"snippet" text NOT NULL,
	"confidence" text DEFAULT 'baixa' NOT NULL,
	"origin" text DEFAULT 'automatico' NOT NULL,
	"note" text,
	"dismissed_at" timestamp with time zone,
	"engine_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_evidence_movement_id_unique" UNIQUE("movement_id")
);
--> statement-breakpoint
ALTER TABLE "case_evidence" ADD CONSTRAINT "case_evidence_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_evidence" ADD CONSTRAINT "case_evidence_movement_id_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_evidence" ADD CONSTRAINT "case_evidence_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_evidence_case_occurred_idx" ON "case_evidence" USING btree ("case_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "case_evidence_case_kind_idx" ON "case_evidence" USING btree ("case_id","kind");
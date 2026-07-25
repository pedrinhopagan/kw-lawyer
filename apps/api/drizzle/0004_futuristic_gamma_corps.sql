CREATE TABLE "calendar_days" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"certainty" text DEFAULT 'certa' NOT NULL,
	"description" text NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_days_scope_day_kind_unique" UNIQUE("scope","day","kind")
);
--> statement-breakpoint
CREATE TABLE "deadlines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lawyer_id" uuid NOT NULL,
	"publication_id" uuid,
	"case_id" uuid,
	"title" text NOT NULL,
	"act_key" text,
	"basis" text,
	"days" integer NOT NULL,
	"unit" text DEFAULT 'uteis' NOT NULL,
	"multiplier" integer DEFAULT 1 NOT NULL,
	"available_at" date,
	"published_at" date,
	"starts_at" date,
	"due_at" date NOT NULL,
	"expected_due_at" date,
	"status" text DEFAULT 'a_confirmar' NOT NULL,
	"origin" text DEFAULT 'automatico' NOT NULL,
	"confidence" text DEFAULT 'baixa' NOT NULL,
	"audience" text DEFAULT 'indefinido' NOT NULL,
	"snippet" text,
	"note" text,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"calculation" jsonb,
	"engine_version" integer DEFAULT 1 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publication_scans" (
	"publication_id" uuid PRIMARY KEY NOT NULL,
	"engine_version" integer NOT NULL,
	"has_candidate" boolean NOT NULL,
	"needs_review" boolean NOT NULL,
	"confidence" text NOT NULL,
	"review_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_lawyer_id_lawyers_id_fk" FOREIGN KEY ("lawyer_id") REFERENCES "public"."lawyers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_scans" ADD CONSTRAINT "publication_scans_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deadlines_auto_publication_lawyer_unique" ON "deadlines" USING btree ("publication_id","lawyer_id") WHERE "deadlines"."origin" = 'automatico';--> statement-breakpoint
CREATE INDEX "deadlines_lawyer_due_idx" ON "deadlines" USING btree ("lawyer_id","due_at");--> statement-breakpoint
CREATE INDEX "deadlines_lawyer_status_idx" ON "deadlines" USING btree ("lawyer_id","status");--> statement-breakpoint
CREATE INDEX "deadlines_publication_idx" ON "deadlines" USING btree ("publication_id");--> statement-breakpoint
CREATE INDEX "deadlines_case_idx" ON "deadlines" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "publication_scans_review_idx" ON "publication_scans" USING btree ("needs_review","has_candidate");
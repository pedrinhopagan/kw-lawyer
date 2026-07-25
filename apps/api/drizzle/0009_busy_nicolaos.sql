CREATE TABLE "case_relations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"incident_case_id" uuid,
	"incident_cnj_number" text NOT NULL,
	"principal_case_id" uuid,
	"principal_cnj_number" text NOT NULL,
	"kind" text NOT NULL,
	"state" text,
	"suspensive_effect" boolean,
	"snippet" text,
	"origin" text DEFAULT 'automatico' NOT NULL,
	"dismissed_at" timestamp with time zone,
	"engine_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_relations_pair_unique" UNIQUE("incident_cnj_number","principal_cnj_number")
);
--> statement-breakpoint
ALTER TABLE "case_relations" ADD CONSTRAINT "case_relations_incident_case_id_cases_id_fk" FOREIGN KEY ("incident_case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_relations" ADD CONSTRAINT "case_relations_principal_case_id_cases_id_fk" FOREIGN KEY ("principal_case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_relations_principal_idx" ON "case_relations" USING btree ("principal_case_id");--> statement-breakpoint
CREATE INDEX "case_relations_incident_idx" ON "case_relations" USING btree ("incident_case_id");
CREATE TABLE "case_appeals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"decision_id" uuid NOT NULL,
	"lawyer_id" uuid NOT NULL,
	"choice" text NOT NULL,
	"act_key" text,
	"reason" text,
	"deadline_id" uuid,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_appeals_decision_lawyer_unique" UNIQUE("decision_id","lawyer_id")
);
--> statement-breakpoint
ALTER TABLE "case_appeals" ADD CONSTRAINT "case_appeals_decision_id_case_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."case_decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_appeals" ADD CONSTRAINT "case_appeals_lawyer_id_lawyers_id_fk" FOREIGN KEY ("lawyer_id") REFERENCES "public"."lawyers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_appeals" ADD CONSTRAINT "case_appeals_deadline_id_deadlines_id_fk" FOREIGN KEY ("deadline_id") REFERENCES "public"."deadlines"("id") ON DELETE set null ON UPDATE no action;
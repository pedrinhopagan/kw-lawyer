CREATE TABLE "case_instances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"grau" text NOT NULL,
	"org_judging_name" text,
	"org_judging_code" text,
	"system_name" text,
	"format_name" text,
	"filed_at" timestamp with time zone,
	"secrecy_level" integer,
	"datajud_document_id" uuid,
	"source_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_instances_case_grau_unique" UNIQUE("case_id","grau")
);
--> statement-breakpoint
CREATE TABLE "datajud_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"tribunal_alias" text NOT NULL,
	"document_id" text NOT NULL,
	"source" jsonb NOT NULL,
	"source_updated_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "datajud_documents_alias_document_unique" UNIQUE("tribunal_alias","document_id")
);
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "datajud_source_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "movements" ADD COLUMN "grau" text;--> statement-breakpoint
ALTER TABLE "case_instances" ADD CONSTRAINT "case_instances_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_instances" ADD CONSTRAINT "case_instances_datajud_document_id_datajud_documents_id_fk" FOREIGN KEY ("datajud_document_id") REFERENCES "public"."datajud_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datajud_documents" ADD CONSTRAINT "datajud_documents_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "datajud_documents_case_id_idx" ON "datajud_documents" USING btree ("case_id");
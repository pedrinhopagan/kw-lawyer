CREATE TABLE "case_lawyers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"lawyer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_lawyers_case_id_lawyer_id_unique" UNIQUE("case_id","lawyer_id")
);
--> statement-breakpoint
CREATE TABLE "case_parties" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"name" text NOT NULL,
	"polo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_parties_case_id_name_polo_unique" UNIQUE NULLS NOT DISTINCT("case_id","name","polo")
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cnj_number" text NOT NULL,
	"formatted_number" text NOT NULL,
	"tribunal" text NOT NULL,
	"org_name" text,
	"class_name" text,
	"class_code" text,
	"last_movement_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cases_cnj_number_unique" UNIQUE("cnj_number")
);
--> statement-breakpoint
CREATE TABLE "lawyers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"oab_number" text NOT NULL,
	"oab_uf" text NOT NULL,
	"djen_advogado_id" integer,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lawyers_oab_number_oab_uf_unique" UNIQUE("oab_number","oab_uf")
);
--> statement-breakpoint
CREATE TABLE "movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"publication_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"type" text,
	"summary" text NOT NULL,
	"source" text DEFAULT 'publication' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movements_publication_id_unique" UNIQUE("publication_id")
);
--> statement-breakpoint
CREATE TABLE "publication_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"publication_id" uuid NOT NULL,
	"lawyer_id" uuid NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_links_publication_id_lawyer_id_unique" UNIQUE("publication_id","lawyer_id")
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" text DEFAULT 'djen' NOT NULL,
	"external_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"case_id" uuid,
	"cnj_number" text,
	"tribunal" text,
	"org_name" text,
	"communication_type" text,
	"document_type" text,
	"available_at" date NOT NULL,
	"medium" text,
	"link" text,
	"text_html" text NOT NULL,
	"text_plain" text NOT NULL,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publications_source_external_id_unique" UNIQUE("source","external_id"),
	CONSTRAINT "publications_source_content_hash_unique" UNIQUE("source","content_hash")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lawyer_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lawyer_id" uuid NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"fetched" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"duplicated" integer DEFAULT 0 NOT NULL,
	"invalid" integer DEFAULT 0 NOT NULL,
	"cases_created" integer DEFAULT 0 NOT NULL,
	"error_message" text
);
--> statement-breakpoint
DROP TABLE "counters" CASCADE;--> statement-breakpoint
ALTER TABLE "case_lawyers" ADD CONSTRAINT "case_lawyers_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_lawyers" ADD CONSTRAINT "case_lawyers_lawyer_id_lawyers_id_fk" FOREIGN KEY ("lawyer_id") REFERENCES "public"."lawyers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_parties" ADD CONSTRAINT "case_parties_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_links" ADD CONSTRAINT "publication_links_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_links" ADD CONSTRAINT "publication_links_lawyer_id_lawyers_id_fk" FOREIGN KEY ("lawyer_id") REFERENCES "public"."lawyers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_lawyer_id_lawyers_id_fk" FOREIGN KEY ("lawyer_id") REFERENCES "public"."lawyers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_lawyer_id_lawyers_id_fk" FOREIGN KEY ("lawyer_id") REFERENCES "public"."lawyers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movements_case_id_occurred_at_idx" ON "movements" USING btree ("case_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "publications_case_id_idx" ON "publications" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "publications_available_at_idx" ON "publications" USING btree ("available_at");
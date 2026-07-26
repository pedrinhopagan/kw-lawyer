CREATE TABLE "oab_collections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"oab_number" text NOT NULL,
	"oab_uf" text NOT NULL,
	"collected_from" date NOT NULL,
	"collected_through" date NOT NULL,
	"last_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oab_collections_oab_number_oab_uf_unique" UNIQUE("oab_number","oab_uf")
);
--> statement-breakpoint
ALTER TABLE "oab_collections" ADD CONSTRAINT "oab_collections_last_run_id_sync_runs_id_fk" FOREIGN KEY ("last_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE set null ON UPDATE no action;
CREATE TABLE "lawyer_oabs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lawyer_id" uuid NOT NULL,
	"oab_number" text NOT NULL,
	"oab_uf" text NOT NULL,
	"holder_name" text,
	"djen_advogado_id" integer,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lawyer_oabs_lawyer_id_oab_number_oab_uf_unique" UNIQUE("lawyer_id","oab_number","oab_uf")
);
--> statement-breakpoint
ALTER TABLE "lawyer_oabs" ADD CONSTRAINT "lawyer_oabs_lawyer_id_lawyers_id_fk" FOREIGN KEY ("lawyer_id") REFERENCES "public"."lawyers"("id") ON DELETE cascade ON UPDATE no action;
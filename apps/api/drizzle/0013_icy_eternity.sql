CREATE TABLE "notification_sends" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lawyer_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"day" date NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"url" text NOT NULL,
	"delivered" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lawyer_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"expiration_time" bigint,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "watch_cycles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"slot" text NOT NULL,
	"status" text NOT NULL,
	"lawyers" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "notification_sends" ADD CONSTRAINT "notification_sends_lawyer_id_lawyers_id_fk" FOREIGN KEY ("lawyer_id") REFERENCES "public"."lawyers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_lawyer_id_lawyers_id_fk" FOREIGN KEY ("lawyer_id") REFERENCES "public"."lawyers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_sends_lawyer_trigger_day_unique" ON "notification_sends" USING btree ("lawyer_id","trigger","day");--> statement-breakpoint
CREATE INDEX "push_subscriptions_lawyer_idx" ON "push_subscriptions" USING btree ("lawyer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "watch_cycles_kind_slot_unique" ON "watch_cycles" USING btree ("kind","slot");
ALTER TABLE "push_subscriptions" DROP CONSTRAINT "push_subscriptions_endpoint_unique";--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "device_id" uuid;--> statement-breakpoint
UPDATE "sessions" SET "device_id" = gen_random_uuid() WHERE "device_id" IS NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "device_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "sessions_device_idx" ON "sessions" USING btree ("device_id");--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_lawyer_endpoint_key" UNIQUE("lawyer_id","endpoint");

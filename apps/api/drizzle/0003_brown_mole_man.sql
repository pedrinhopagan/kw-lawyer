ALTER TABLE "publications" ADD COLUMN "excerpt" text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE "publications" SET "excerpt" = left("text_plain", 300);--> statement-breakpoint
ALTER TABLE "publications" ALTER COLUMN "excerpt" DROP DEFAULT;

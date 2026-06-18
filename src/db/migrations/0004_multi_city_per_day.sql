CREATE TABLE "instructor_working_day_cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"working_day_id" uuid NOT NULL,
	"city" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "slots" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "slots" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "instructor_working_day_cities" ADD CONSTRAINT "instructor_working_day_cities_working_day_id_instructor_working_days_id_fk" FOREIGN KEY ("working_day_id") REFERENCES "public"."instructor_working_days"("id") ON DELETE cascade ON UPDATE no action;

-- Backfill: seed child table from existing scalar city on working_days
INSERT INTO "instructor_working_day_cities" ("working_day_id", "city", "position")
SELECT "id", "city", 0 FROM "instructor_working_days"
WHERE "city" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill: down-fill slots.city from the day's city
UPDATE "slots" s SET "city" = wd."city"
FROM "instructor_working_days" wd
WHERE wd."instructor_id" = s."instructor_id" AND wd."date" = s."date"
  AND s."city" IS NULL AND wd."city" IS NOT NULL;

-- Backfill: down-fill lessons.city from the day's city
UPDATE "lessons" l SET "city" = wd."city"
FROM "instructor_working_days" wd
WHERE wd."instructor_id" = l."instructor_id" AND wd."date" = l."date"
  AND l."city" IS NULL AND wd."city" IS NOT NULL;

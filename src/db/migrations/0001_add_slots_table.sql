CREATE TABLE "slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instructor_id" uuid NOT NULL,
	"date" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"is_booked" boolean DEFAULT false,
	"lesson_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_instructor_id_users_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "slots_instructor_date_idx" ON "slots" ("instructor_id","date");

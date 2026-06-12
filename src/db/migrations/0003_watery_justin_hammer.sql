CREATE TABLE "google_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"expiry_date" timestamp,
	"scope" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
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
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "instructor_working_days" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "instructor_working_days" ADD COLUMN "vehicle" text;--> statement-breakpoint
ALTER TABLE "instructor_working_days" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "google_event_id" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "city" text DEFAULT 'Olaine' NOT NULL;--> statement-breakpoint
ALTER TABLE "google_tokens" ADD CONSTRAINT "google_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_instructor_id_users_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;
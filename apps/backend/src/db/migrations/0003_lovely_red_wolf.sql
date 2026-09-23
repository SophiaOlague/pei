CREATE TYPE "public"."legal_document_type_enum" AS ENUM('privacy_notice', 'terms_and_conditions');--> statement-breakpoint
CREATE TABLE "clinical_record_consent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"granted" boolean NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clinical_record_consent_appointment_id_unique" UNIQUE("appointment_id")
);
--> statement-breakpoint
CREATE TABLE "legal_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "legal_document_type_enum" NOT NULL,
	"version" varchar NOT NULL,
	"content" text NOT NULL,
	"published_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_legal_acceptance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_profile_id" uuid NOT NULL,
	"legal_document_id" uuid NOT NULL,
	"accepted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinical_record_consent" ADD CONSTRAINT "clinical_record_consent_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_legal_acceptance" ADD CONSTRAINT "user_legal_acceptance_user_profile_id_user_profile_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_legal_acceptance" ADD CONSTRAINT "user_legal_acceptance_legal_document_id_legal_document_id_fk" FOREIGN KEY ("legal_document_id") REFERENCES "public"."legal_document"("id") ON DELETE no action ON UPDATE no action;
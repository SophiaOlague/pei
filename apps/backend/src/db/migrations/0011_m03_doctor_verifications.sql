-- ============================================================
-- PEI — M03 B2 (2/2): columnas nuevas de doctor_profile y tablas de revisión de INE y cédula (plan v2 §3, 0011; §7, §8).
-- Generada con drizzle-kit, sin ediciones en las sentencias: solo adiciones (tipos, tablas, columnas, FK, CHECK, índices).
-- ADD COLUMN specialty_id NOT NULL supone 0 filas en doctor_profile (lo garantiza el guard de 0010).
-- Las reglas de versión, inmutabilidad y transición de estados las impone 0012 (B3), no esta migración.
-- NO APLICADA: requiere revisión (sha256), ensayo BEGIN … ROLLBACK y autorización (PC-B2), junto con 0010.
-- ============================================================
CREATE TYPE "public"."doctor_license_review_reason_enum" AS ENUM('initial', 'resubmission', 'license_number_changed', 'license_document_changed', 'specialty_changed', 'legal_name_changed');--> statement-breakpoint
CREATE TYPE "public"."doctor_review_status_enum" AS ENUM('pending', 'approved', 'rejected', 'superseded');--> statement-breakpoint
CREATE TABLE "doctor_identity_verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"identity_revision" integer NOT NULL,
	"ine_front_object_key" text,
	"ine_back_object_key" text,
	"status" "doctor_review_status_enum" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"documents_deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_identity_verification_doctor_attempt_uq" UNIQUE("doctor_id","attempt"),
	CONSTRAINT "doctor_identity_verification_attempt_chk" CHECK ("doctor_identity_verification"."attempt" > 0 AND "doctor_identity_verification"."identity_revision" > 0),
	CONSTRAINT "doctor_identity_verification_keys_chk" CHECK (("doctor_identity_verification"."documents_deleted_at" IS NULL AND "doctor_identity_verification"."ine_front_object_key" IS NOT NULL AND "doctor_identity_verification"."ine_back_object_key" IS NOT NULL)
        OR ("doctor_identity_verification"."documents_deleted_at" IS NOT NULL AND "doctor_identity_verification"."ine_front_object_key" IS NULL AND "doctor_identity_verification"."ine_back_object_key" IS NULL)),
	CONSTRAINT "doctor_identity_verification_no_pending_purge_chk" CHECK ("doctor_identity_verification"."documents_deleted_at" IS NULL OR "doctor_identity_verification"."status" <> 'pending'),
	CONSTRAINT "doctor_identity_verification_reviewed_chk" CHECK (("doctor_identity_verification"."status" IN ('approved','rejected') AND "doctor_identity_verification"."reviewed_by" IS NOT NULL AND "doctor_identity_verification"."reviewed_at" IS NOT NULL)
        OR ("doctor_identity_verification"."status" IN ('pending','superseded') AND "doctor_identity_verification"."reviewed_by" IS NULL AND "doctor_identity_verification"."reviewed_at" IS NULL)),
	CONSTRAINT "doctor_identity_verification_reason_chk" CHECK (("doctor_identity_verification"."status" = 'rejected' AND char_length("doctor_identity_verification"."rejection_reason") BETWEEN 10 AND 500)
        OR ("doctor_identity_verification"."status" <> 'rejected' AND "doctor_identity_verification"."rejection_reason" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "doctor_license_verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"professional_revision" integer NOT NULL,
	"reason" "doctor_license_review_reason_enum" NOT NULL,
	"license_number" varchar(20) NOT NULL,
	"specialty_id" uuid NOT NULL,
	"document_object_key" text NOT NULL,
	"status" "doctor_review_status_enum" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_license_verification_doctor_attempt_uq" UNIQUE("doctor_id","attempt"),
	CONSTRAINT "doctor_license_verification_attempt_chk" CHECK ("doctor_license_verification"."attempt" > 0 AND "doctor_license_verification"."professional_revision" > 0),
	CONSTRAINT "doctor_license_verification_number_chk" CHECK ("doctor_license_verification"."license_number" ~ '^[0-9A-Za-z-]{1,20}$'),
	CONSTRAINT "doctor_license_verification_reviewed_chk" CHECK (("doctor_license_verification"."status" IN ('approved','rejected') AND "doctor_license_verification"."reviewed_by" IS NOT NULL AND "doctor_license_verification"."reviewed_at" IS NOT NULL)
        OR ("doctor_license_verification"."status" IN ('pending','superseded') AND "doctor_license_verification"."reviewed_by" IS NULL AND "doctor_license_verification"."reviewed_at" IS NULL)),
	CONSTRAINT "doctor_license_verification_reason_chk" CHECK (("doctor_license_verification"."status" = 'rejected' AND char_length("doctor_license_verification"."rejection_reason") BETWEEN 10 AND 500)
        OR ("doctor_license_verification"."status" <> 'rejected' AND "doctor_license_verification"."rejection_reason" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "doctor_profile" ADD COLUMN "specialty_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "doctor_profile" ADD COLUMN "photo_object_key" text;--> statement-breakpoint
ALTER TABLE "doctor_profile" ADD COLUMN "identity_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "doctor_profile" ADD COLUMN "professional_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "doctor_identity_verification" ADD CONSTRAINT "doctor_identity_verification_doctor_id_doctor_profile_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctor_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_identity_verification" ADD CONSTRAINT "doctor_identity_verification_reviewed_by_user_profile_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_license_verification" ADD CONSTRAINT "doctor_license_verification_doctor_id_doctor_profile_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctor_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_license_verification" ADD CONSTRAINT "doctor_license_verification_specialty_id_specialty_id_fk" FOREIGN KEY ("specialty_id") REFERENCES "public"."specialty"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_license_verification" ADD CONSTRAINT "doctor_license_verification_reviewed_by_user_profile_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "doctor_identity_verification_one_pending_uq" ON "doctor_identity_verification" USING btree ("doctor_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "doctor_identity_verification_status_created_idx" ON "doctor_identity_verification" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "doctor_identity_verification_doctor_idx" ON "doctor_identity_verification" USING btree ("doctor_id","attempt");--> statement-breakpoint
CREATE UNIQUE INDEX "doctor_license_verification_one_pending_uq" ON "doctor_license_verification" USING btree ("doctor_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "doctor_license_verification_status_created_idx" ON "doctor_license_verification" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "doctor_license_verification_doctor_idx" ON "doctor_license_verification" USING btree ("doctor_id","attempt");--> statement-breakpoint
ALTER TABLE "doctor_profile" ADD CONSTRAINT "doctor_profile_specialty_id_specialty_id_fk" FOREIGN KEY ("specialty_id") REFERENCES "public"."specialty"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doctor_profile_specialty_idx" ON "doctor_profile" USING btree ("specialty_id");--> statement-breakpoint
ALTER TABLE "doctor_profile" ADD CONSTRAINT "doctor_profile_revisions_chk" CHECK ("doctor_profile"."identity_revision" > 0 AND "doctor_profile"."professional_revision" > 0);--> statement-breakpoint
ALTER TABLE "doctor_profile" ADD CONSTRAINT "doctor_profile_license_number_format_chk" CHECK ("doctor_profile"."license_number" IS NULL OR "doctor_profile"."license_number" ~ '^[0-9A-Za-z-]{1,20}$');
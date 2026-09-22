CREATE TYPE "public"."appointment_status_enum" AS ENUM('pending_payment', 'confirmed', 'completed', 'canceled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."appointment_type_enum" AS ENUM('scheduled', 'emergency');--> statement-breakpoint
CREATE TYPE "public"."delivery_method_enum" AS ENUM('pickup', 'home_delivery');--> statement-breakpoint
CREATE TYPE "public"."dispensation_status_enum" AS ENUM('pending', 'packed', 'shipped', 'ready_for_pickup', 'redeemed', 'delivered', 'expired', 'out_of_stock');--> statement-breakpoint
CREATE TYPE "public"."doctor_verification_status_enum" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."lab_status_enum" AS ENUM('optimal', 'sufficient', 'out_of_range');--> statement-breakpoint
CREATE TYPE "public"."meeting_status_enum" AS ENUM('scheduled', 'active', 'ended');--> statement-breakpoint
CREATE TYPE "public"."membership_status_enum" AS ENUM('active', 'past_due', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."organization_type_enum" AS ENUM('casa_arcoiris', 'institucion_publica', 'otro');--> statement-breakpoint
CREATE TYPE "public"."payment_status_enum" AS ENUM('pending', 'succeeded', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_type_enum" AS ENUM('membership', 'consultation', 'medication');--> statement-breakpoint
CREATE TYPE "public"."redemption_status_enum" AS ENUM('pending', 'redeemed', 'expired', 'canceled', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."risk_level_enum" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."role_enum" AS ENUM('patient', 'doctor', 'admin', 'organization');--> statement-breakpoint
CREATE TYPE "public"."specialty_enum" AS ENUM('infectologia', 'psicologia', 'medicina_general');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action" varchar NOT NULL,
	"entity_type" varchar,
	"entity_id" uuid,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_setting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consultation_price" numeric NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role" "role_enum" NOT NULL,
	"phone" varchar,
	"birth_date" date,
	"emergency_contact_name" varchar,
	"emergency_contact_phone" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_profile_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "medication" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"photo_url" text,
	CONSTRAINT "medication_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_profile_id" uuid NOT NULL,
	"name" varchar NOT NULL,
	"type" "organization_type_enum" NOT NULL,
	"address" text,
	"contact_email" varchar,
	"contact_phone" varchar,
	"photo_url" text,
	CONSTRAINT "organization_user_profile_id_unique" UNIQUE("user_profile_id")
);
--> statement-breakpoint
CREATE TABLE "organization_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"medication_id" uuid NOT NULL,
	"quantity_available" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_profile_id" uuid NOT NULL,
	"curp" varchar,
	"address" text,
	"risk_level" "risk_level_enum",
	"photo_url" text,
	CONSTRAINT "patient_profile_user_profile_id_unique" UNIQUE("user_profile_id"),
	CONSTRAINT "patient_profile_curp_unique" UNIQUE("curp")
);
--> statement-breakpoint
CREATE TABLE "doctor_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctor_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_profile_id" uuid NOT NULL,
	"specialty" "specialty_enum" NOT NULL,
	"license_number" varchar NOT NULL,
	"license_document_url" text,
	"bio" text,
	"photo_url" text,
	"membership_status" "membership_status_enum" NOT NULL,
	"verification_status" "doctor_verification_status_enum" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp,
	"rejection_reason" text,
	"rating_avg" numeric DEFAULT '0' NOT NULL,
	CONSTRAINT "doctor_profile_user_profile_id_unique" UNIQUE("user_profile_id"),
	CONSTRAINT "doctor_profile_license_number_unique" UNIQUE("license_number")
);
--> statement-breakpoint
CREATE TABLE "doctor_time_off" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"reason" varchar
);
--> statement-breakpoint
CREATE TABLE "appointment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"type" "appointment_type_enum" NOT NULL,
	"status" "appointment_status_enum" NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"reason" varchar NOT NULL,
	"notes" text,
	"cancellation_reason" text,
	"price" numeric NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"room_id" varchar NOT NULL,
	"status" "meeting_status_enum" DEFAULT 'scheduled' NOT NULL,
	"started_at" timestamp,
	"ended_at" timestamp,
	"recording_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_appointment_id_unique" UNIQUE("appointment_id"),
	CONSTRAINT "meeting_room_id_unique" UNIQUE("room_id")
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "review_appointment_id_unique" UNIQUE("appointment_id")
);
--> statement-breakpoint
CREATE TABLE "lab_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medical_record_id" uuid NOT NULL,
	"test_name" varchar NOT NULL,
	"test_date" timestamp NOT NULL,
	"value" numeric,
	"unit" varchar,
	"reference_range_low" numeric,
	"reference_range_high" numeric,
	"status" "lab_status_enum" NOT NULL,
	"file_url" text
);
--> statement-breakpoint
CREATE TABLE "medical_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"blood_type" varchar,
	"allergies" text,
	"diagnosis_summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "medical_record_patient_id_unique" UNIQUE("patient_id")
);
--> statement-breakpoint
CREATE TABLE "medical_record_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medical_record_id" uuid NOT NULL,
	"appointment_id" uuid,
	"authored_by" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prescription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medical_record_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"appointment_id" uuid,
	"medication_id" uuid NOT NULL,
	"dosage" varchar NOT NULL,
	"instructions" text,
	"enables_prep_purchase" boolean DEFAULT false NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"next_refill_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "treatment_dispensation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prescription_id" uuid NOT NULL,
	"organization_id" uuid,
	"delivery_method" "delivery_method_enum" NOT NULL,
	"shipping_address" text,
	"redemption_code" varchar,
	"redemption_status" "redemption_status_enum" DEFAULT 'not_applicable' NOT NULL,
	"redeemed_by_org_id" uuid,
	"redeemed_at" timestamp,
	"expires_at" timestamp,
	"packed_by" uuid,
	"shipped_at" timestamp,
	"tracking_number" varchar,
	"dispensed_at" timestamp,
	"status" "dispensation_status_enum" DEFAULT 'pending' NOT NULL,
	CONSTRAINT "treatment_dispensation_redemption_code_unique" UNIQUE("redemption_code")
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid,
	"patient_id" uuid,
	"appointment_id" uuid,
	"type" "payment_type_enum" NOT NULL,
	"amount" numeric NOT NULL,
	"currency" varchar NOT NULL,
	"stripe_payment_id" varchar,
	"status" "payment_status_enum" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_stripe_payment_id_unique" UNIQUE("stripe_payment_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_user_profile_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_setting" ADD CONSTRAINT "platform_setting_updated_by_user_profile_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_user_profile_id_user_profile_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_inventory" ADD CONSTRAINT "organization_inventory_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_inventory" ADD CONSTRAINT "organization_inventory_medication_id_medication_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medication"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_profile" ADD CONSTRAINT "patient_profile_user_profile_id_user_profile_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_availability" ADD CONSTRAINT "doctor_availability_doctor_id_doctor_profile_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctor_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_profile" ADD CONSTRAINT "doctor_profile_user_profile_id_user_profile_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_profile" ADD CONSTRAINT "doctor_profile_reviewed_by_user_profile_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_time_off" ADD CONSTRAINT "doctor_time_off_doctor_id_doctor_profile_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctor_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_patient_id_patient_profile_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_doctor_id_doctor_profile_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctor_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_result" ADD CONSTRAINT "lab_result_medical_record_id_medical_record_id_fk" FOREIGN KEY ("medical_record_id") REFERENCES "public"."medical_record"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_record" ADD CONSTRAINT "medical_record_patient_id_patient_profile_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_record_entry" ADD CONSTRAINT "medical_record_entry_medical_record_id_medical_record_id_fk" FOREIGN KEY ("medical_record_id") REFERENCES "public"."medical_record"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_record_entry" ADD CONSTRAINT "medical_record_entry_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_record_entry" ADD CONSTRAINT "medical_record_entry_authored_by_doctor_profile_id_fk" FOREIGN KEY ("authored_by") REFERENCES "public"."doctor_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_medical_record_id_medical_record_id_fk" FOREIGN KEY ("medical_record_id") REFERENCES "public"."medical_record"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_doctor_id_doctor_profile_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctor_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_medication_id_medication_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medication"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_dispensation" ADD CONSTRAINT "treatment_dispensation_prescription_id_prescription_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescription"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_dispensation" ADD CONSTRAINT "treatment_dispensation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_dispensation" ADD CONSTRAINT "treatment_dispensation_redeemed_by_org_id_organization_id_fk" FOREIGN KEY ("redeemed_by_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_dispensation" ADD CONSTRAINT "treatment_dispensation_packed_by_user_profile_id_fk" FOREIGN KEY ("packed_by") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_doctor_id_doctor_profile_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctor_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_patient_id_patient_profile_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_inventory" ADD CONSTRAINT "quantity_available_non_negative" CHECK ("quantity_available" >= 0);
CREATE INDEX "org_inventory_org_idx" ON "organization_inventory" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "doctor_availability_doctor_idx" ON "doctor_availability" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "appointment_doctor_idx" ON "appointment" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "appointment_patient_idx" ON "appointment" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "appointment_scheduled_at_idx" ON "appointment" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "medical_record_entry_record_idx" ON "medical_record_entry" USING btree ("medical_record_id");

-- RNF-02: una aportación al expediente clínico no puede editarse una vez marcada como bloqueada (is_locked = true)
CREATE OR REPLACE FUNCTION prevent_locked_entry_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_locked = true THEN
    RAISE EXCEPTION 'No se puede modificar una aportación al expediente clínico ya cerrada (id: %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_locked_entry_update
  BEFORE UPDATE ON "medical_record_entry"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_locked_entry_update();
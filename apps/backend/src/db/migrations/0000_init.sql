CREATE TYPE "public"."alcohol_consumption_enum" AS ENUM('none', 'occasional', 'frequent');--> statement-breakpoint
CREATE TYPE "public"."appointment_status_enum" AS ENUM('pending_payment', 'expired', 'confirmed', 'completed', 'canceled', 'no_show_patient', 'no_show_doctor', 'no_show_both');--> statement-breakpoint
CREATE TYPE "public"."appointment_type_enum" AS ENUM('scheduled', 'emergency');--> statement-breakpoint
CREATE TYPE "public"."audit_actor_type_enum" AS ENUM('user', 'system');--> statement-breakpoint
CREATE TYPE "public"."cancellation_actor_type_enum" AS ENUM('patient', 'doctor', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."delivery_method_enum" AS ENUM('pickup', 'home_delivery');--> statement-breakpoint
CREATE TYPE "public"."doctor_payout_adjustment_type_enum" AS ENUM('refund_reversal', 'chargeback', 'correction', 'other');--> statement-breakpoint
CREATE TYPE "public"."doctor_payout_item_eligibility_enum" AS ENUM('eligible', 'on_hold', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."doctor_verification_status_enum" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."identity_verification_status_enum" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."inventory_movement_type_enum" AS ENUM('receipt', 'adjustment_in', 'adjustment_out', 'reservation', 'reservation_release', 'dispensation', 'return_pending', 'return_accepted', 'transfer_in', 'transfer_out', 'expiration');--> statement-breakpoint
CREATE TYPE "public"."legal_document_type_enum" AS ENUM('privacy_notice', 'terms_and_conditions');--> statement-breakpoint
CREATE TYPE "public"."meeting_participant_enum" AS ENUM('patient', 'doctor');--> statement-breakpoint
CREATE TYPE "public"."meeting_session_event_type_enum" AS ENUM('joined', 'left');--> statement-breakpoint
CREATE TYPE "public"."meeting_status_enum" AS ENUM('scheduled', 'active', 'ended');--> statement-breakpoint
CREATE TYPE "public"."notification_channel_enum" AS ENUM('in_app', 'push');--> statement-breakpoint
CREATE TYPE "public"."notification_delivery_status_enum" AS ENUM('pending', 'sent', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_type_enum" AS ENUM('appointment_confirmed', 'appointment_reminder', 'appointment_canceled', 'appointment_rescheduled', 'appointment_waiting', 'appointment_completed', 'order_confirmed', 'order_canceled', 'order_preparing', 'order_ready_for_pickup', 'order_shipped', 'order_delivered', 'order_pickup_expiring', 'order_pickup_expired', 'payment_succeeded', 'payment_failed', 'refund_processing', 'refund_succeeded', 'refund_failed', 'payout_processing', 'payout_succeeded', 'payout_failed', 'prescription_issued', 'prescription_canceled', 'prescription_expiring', 'prescription_expired', 'lab_result_available', 'security_event', 'order_delivery_failed', 'support_request_updated');--> statement-breakpoint
CREATE TYPE "public"."order_status_enum" AS ENUM('order_received', 'preparing', 'ready_for_pickup', 'shipped', 'delivery_failed', 'delivered', 'picked_up', 'pickup_expired', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."organization_type_enum" AS ENUM('casa_arcoiris', 'institucion_publica', 'otro');--> statement-breakpoint
CREATE TYPE "public"."payment_status_enum" AS ENUM('pending', 'requires_action', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."payment_type_enum" AS ENUM('consultation', 'medication');--> statement-breakpoint
CREATE TYPE "public"."payout_frequency_enum" AS ENUM('weekly', 'biweekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."payout_status_enum" AS ENUM('pending', 'processing', 'paid', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."physical_activity_enum" AS ENUM('none', 'one_two_per_week', 'three_four_per_week', 'five_or_more_per_week');--> statement-breakpoint
CREATE TYPE "public"."prescription_fulfillment_status_enum" AS ENUM('reserved', 'dispensed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."prescription_signature_status_enum" AS ENUM('pending', 'signed', 'failed', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."prescription_status_enum" AS ENUM('draft', 'active', 'expired', 'canceled', 'exhausted');--> statement-breakpoint
CREATE TYPE "public"."refund_reason_enum" AS ENUM('patient_cancellation', 'doctor_cancellation', 'admin_cancellation', 'exceptional_refund', 'pickup_expired', 'payment_error', 'other');--> statement-breakpoint
CREATE TYPE "public"."refund_status_enum" AS ENUM('requested', 'pending', 'processing', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."risk_level_enum" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."role_enum" AS ENUM('patient', 'doctor', 'admin', 'organization');--> statement-breakpoint
CREATE TYPE "public"."smoking_status_enum" AS ENUM('non_smoker', 'occasional', 'regular', 'former_smoker');--> statement-breakpoint
CREATE TYPE "public"."specialty_enum" AS ENUM('infectologia', 'psicologia', 'medicina_general');--> statement-breakpoint
CREATE TYPE "public"."stripe_connect_status_enum" AS ENUM('pending', 'onboarding', 'restricted', 'enabled', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."stripe_payment_method_status_enum" AS ENUM('active', 'detached');--> statement-breakpoint
CREATE TYPE "public"."support_incident_cause_enum" AS ENUM('platform_fault', 'doctor_fault', 'patient_fault', 'undetermined');--> statement-breakpoint
CREATE TYPE "public"."support_request_status_enum" AS ENUM('open', 'in_review', 'resolved', 'rejected');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" "audit_actor_type_enum" NOT NULL,
	"actor_user_profile_id" uuid,
	"action" varchar NOT NULL,
	"entity_type" varchar,
	"entity_id" uuid,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role" "role_enum" NOT NULL,
	"first_name" varchar NOT NULL,
	"last_name" varchar NOT NULL,
	"phone" varchar,
	"birth_date" date,
	"emergency_contact_name" varchar,
	"emergency_contact_phone" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profile_user_id_unique" UNIQUE("user_id")
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_user_profile_id_unique" UNIQUE("user_profile_id")
);
--> statement-breakpoint
CREATE TABLE "patient_health_summary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"blood_type" varchar,
	"allergies" text,
	"medical_conditions" text,
	"smoking_status" "smoking_status_enum",
	"alcohol_consumption" "alcohol_consumption_enum",
	"physical_activity" "physical_activity_enum",
	"weight_kg" numeric(6, 2),
	"height_m" numeric(4, 2),
	"systolic_pressure" integer,
	"diastolic_pressure" integer,
	"heart_rate_bpm" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_health_summary_patient_id_unique" UNIQUE("patient_id")
);
--> statement-breakpoint
CREATE TABLE "patient_identity_verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"ine_front_url" text NOT NULL,
	"ine_back_url" text NOT NULL,
	"status" "identity_verification_status_enum" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_identity_verification_patient_id_unique" UNIQUE("patient_id")
);
--> statement-breakpoint
CREATE TABLE "patient_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_profile_id" uuid NOT NULL,
	"curp" varchar,
	"address" text,
	"risk_level" "risk_level_enum",
	"photo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_profile_user_profile_id_unique" UNIQUE("user_profile_id"),
	CONSTRAINT "patient_profile_curp_unique" UNIQUE("curp")
);
--> statement-breakpoint
CREATE TABLE "doctor_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	CONSTRAINT "doctor_availability_range_chk" CHECK ("doctor_availability"."end_time" > "doctor_availability"."start_time")
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
	"verification_status" "doctor_verification_status_enum" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"appointment_duration_minutes" integer DEFAULT 30 NOT NULL,
	"rating_avg" numeric(3, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_profile_user_profile_id_unique" UNIQUE("user_profile_id"),
	CONSTRAINT "doctor_profile_license_number_unique" UNIQUE("license_number")
);
--> statement-breakpoint
CREATE TABLE "doctor_time_off" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" varchar,
	CONSTRAINT "doctor_time_off_range_chk" CHECK ("doctor_time_off"."ends_at" > "doctor_time_off"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"medication_presentation_id" uuid NOT NULL,
	"quantity_on_hand" integer DEFAULT 0 NOT NULL,
	"quantity_reserved" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_quantity_on_hand_chk" CHECK ("inventory"."quantity_on_hand" >= 0),
	CONSTRAINT "inventory_quantity_reserved_chk" CHECK ("inventory"."quantity_reserved" >= 0 and "inventory"."quantity_reserved" <= "inventory"."quantity_on_hand")
);
--> statement-breakpoint
CREATE TABLE "inventory_hold" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_id" uuid NOT NULL,
	"medication_order_id" uuid,
	"medication_order_item_id" uuid,
	"quantity" integer NOT NULL,
	"expires_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_movement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_id" uuid NOT NULL,
	"type" "inventory_movement_type_enum" NOT NULL,
	"quantity" integer NOT NULL,
	"medication_order_id" uuid,
	"medication_order_item_id" uuid,
	"organization_id" uuid,
	"performed_by" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"photo_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medication_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "medication_presentation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medication_id" uuid NOT NULL,
	"name" varchar NOT NULL,
	"dosage_form" varchar NOT NULL,
	"strength" varchar,
	"unit_count" integer,
	"unit" varchar,
	"sale_price" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"type" "appointment_type_enum" NOT NULL,
	"status" "appointment_status_enum" NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"reason" varchar NOT NULL,
	"notes" text,
	"price" numeric(10, 2) NOT NULL,
	"cancellation_policy_id" uuid NOT NULL,
	"payment_hold_expires_at" timestamp with time zone,
	"cancellation_reason" text,
	"cancelled_by_type" "cancellation_actor_type_enum",
	"cancelled_by_user_profile_id" uuid,
	"cancelled_at" timestamp with time zone,
	"rescheduled_from_appointment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"status" "appointment_status_enum" NOT NULL,
	"changed_by_type" "cancellation_actor_type_enum",
	"changed_by_user_profile_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"room_id" varchar NOT NULL,
	"status" "meeting_status_enum" DEFAULT 'scheduled' NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"patient_joined_at" timestamp with time zone,
	"doctor_joined_at" timestamp with time zone,
	"recording_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_appointment_id_unique" UNIQUE("appointment_id"),
	CONSTRAINT "meeting_room_id_unique" UNIQUE("room_id")
);
--> statement-breakpoint
CREATE TABLE "meeting_session_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"participant" "meeting_participant_enum" NOT NULL,
	"event_type" "meeting_session_event_type_enum" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_appointment_id_unique" UNIQUE("appointment_id")
);
--> statement-breakpoint
CREATE TABLE "lab_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medical_record_id" uuid NOT NULL,
	"file_url" text NOT NULL,
	"uploaded_by_user_profile_id" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medical_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medical_record_patient_id_unique" UNIQUE("patient_id")
);
--> statement-breakpoint
CREATE TABLE "medical_record_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medical_record_id" uuid NOT NULL,
	"appointment_id" uuid,
	"authored_by" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "prescription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medical_record_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"appointment_id" uuid,
	"status" "prescription_status_enum" DEFAULT 'draft' NOT NULL,
	"issued_at" timestamp with time zone,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"instructions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prescription_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prescription_id" uuid NOT NULL,
	"medication_presentation_id" uuid NOT NULL,
	"dosage" varchar NOT NULL,
	"frequency" varchar NOT NULL,
	"duration_days" integer,
	"quantity_prescribed" integer NOT NULL,
	"enables_purchase" boolean DEFAULT false NOT NULL,
	"instructions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prescription_item_quantity_chk" CHECK ("prescription_item"."quantity_prescribed" > 0)
);
--> statement-breakpoint
CREATE TABLE "prescription_item_fulfillment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prescription_item_id" uuid NOT NULL,
	"medication_order_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"status" "prescription_fulfillment_status_enum" DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prescription_fulfillment_quantity_chk" CHECK ("prescription_item_fulfillment"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "prescription_signature" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prescription_id" uuid NOT NULL,
	"status" "prescription_signature_status_enum" DEFAULT 'pending' NOT NULL,
	"signature_method" varchar NOT NULL,
	"signed_by_doctor_id" uuid NOT NULL,
	"signed_at" timestamp with time zone,
	"document_hash" varchar,
	"signed_document_url" text,
	"certificate_reference" text,
	"signature_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prescription_signature_prescription_id_unique" UNIQUE("prescription_id")
);
--> statement-breakpoint
CREATE TABLE "cart" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_patient_id_unique" UNIQUE("patient_id")
);
--> statement-breakpoint
CREATE TABLE "cart_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"prescription_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_item_quantity_chk" CHECK ("cart_item"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "medication_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"delivery_method" "delivery_method_enum" NOT NULL,
	"organization_id" uuid,
	"shipping_address" text,
	"subtotal" numeric(10, 2) NOT NULL,
	"shipping_cost" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'MXN' NOT NULL,
	"status" "order_status_enum" DEFAULT 'order_received' NOT NULL,
	"cancellation_reason" text,
	"cancelled_by_type" "cancellation_actor_type_enum",
	"cancelled_by_user_profile_id" uuid,
	"cancelled_at" timestamp with time zone,
	"pickup_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medication_order_delivery_chk" CHECK (("medication_order"."delivery_method" = 'pickup' and "medication_order"."organization_id" is not null) or ("medication_order"."delivery_method" = 'home_delivery' and "medication_order"."shipping_address" is not null))
);
--> statement-breakpoint
CREATE TABLE "medication_order_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"prescription_item_id" uuid NOT NULL,
	"medication_presentation_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	CONSTRAINT "medication_order_item_quantity_chk" CHECK ("medication_order_item"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "order_status_enum" NOT NULL,
	"changed_by_type" "cancellation_actor_type_enum",
	"changed_by_user_profile_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treatment_dispensation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"organization_id" uuid,
	"delivery_method" "delivery_method_enum" NOT NULL,
	"redemption_code" varchar,
	"expires_at" timestamp with time zone,
	"packed_by" uuid,
	"shipped_at" timestamp with time zone,
	"tracking_number" varchar,
	"redeemed_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "treatment_dispensation_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "treatment_dispensation_redemption_code_unique" UNIQUE("redemption_code")
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid,
	"patient_id" uuid NOT NULL,
	"appointment_id" uuid,
	"medication_order_id" uuid,
	"type" "payment_type_enum" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'MXN' NOT NULL,
	"stripe_payment_intent_id" varchar NOT NULL,
	"stripe_charge_id" varchar,
	"status" "payment_status_enum" DEFAULT 'pending' NOT NULL,
	"doctor_percentage" numeric(5, 2),
	"platform_percentage" numeric(5, 2),
	"doctor_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"platform_amount" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id"),
	CONSTRAINT "payment_amount_chk" CHECK ("payment"."amount" > 0),
	CONSTRAINT "payment_medication_split_chk" CHECK ("payment"."type" <> 'medication' or ("payment"."platform_percentage" = 100 and "payment"."doctor_amount" = 0)),
	CONSTRAINT "payment_type_reference_chk" CHECK (("payment"."type" = 'consultation' and "payment"."appointment_id" is not null) or ("payment"."type" = 'medication' and "payment"."medication_order_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "refund" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'MXN' NOT NULL,
	"reason" "refund_reason_enum" NOT NULL,
	"status" "refund_status_enum" DEFAULT 'requested' NOT NULL,
	"stripe_refund_id" varchar,
	"requested_by_type" "cancellation_actor_type_enum",
	"requested_by_user_profile_id" uuid,
	"approved_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"failure_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refund_stripe_refund_id_unique" UNIQUE("stripe_refund_id"),
	CONSTRAINT "refund_amount_chk" CHECK ("refund"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "stripe_connect_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"stripe_account_id" varchar NOT NULL,
	"status" "stripe_connect_status_enum" DEFAULT 'pending' NOT NULL,
	"charges_enabled" boolean DEFAULT false NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"details_submitted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_connect_account_doctor_id_unique" UNIQUE("doctor_id"),
	CONSTRAINT "stripe_connect_account_stripe_account_id_unique" UNIQUE("stripe_account_id")
);
--> statement-breakpoint
CREATE TABLE "stripe_payment_method" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"stripe_customer_id" varchar NOT NULL,
	"stripe_payment_method_id" varchar NOT NULL,
	"type" varchar DEFAULT 'card' NOT NULL,
	"brand" varchar,
	"last4" varchar(4),
	"exp_month" integer,
	"exp_year" integer,
	"status" "stripe_payment_method_status_enum" DEFAULT 'active' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_payment_method_stripe_payment_method_id_unique" UNIQUE("stripe_payment_method_id")
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" varchar NOT NULL,
	"event_type" varchar NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar DEFAULT 'received' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	CONSTRAINT "stripe_webhook_event_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
CREATE TABLE "consultation_commission_configuration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_percentage" numeric(5, 2) NOT NULL,
	"platform_percentage" numeric(5, 2) NOT NULL,
	"payout_frequency" "payout_frequency_enum" NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_percentages_range_chk" CHECK ("consultation_commission_configuration"."doctor_percentage" between 0 and 100 and "consultation_commission_configuration"."platform_percentage" between 0 and 100),
	CONSTRAINT "commission_percentages_sum_chk" CHECK ("consultation_commission_configuration"."doctor_percentage" + "consultation_commission_configuration"."platform_percentage" = 100)
);
--> statement-breakpoint
CREATE TABLE "doctor_payout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"gross_amount" numeric(10, 2) NOT NULL,
	"adjustment_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(10, 2) NOT NULL,
	"transferred_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(3) DEFAULT 'MXN' NOT NULL,
	"status" "payout_status_enum" DEFAULT 'pending' NOT NULL,
	"stripe_transfer_id" varchar,
	"paid_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_payout_stripe_transfer_id_unique" UNIQUE("stripe_transfer_id"),
	CONSTRAINT "doctor_payout_period_chk" CHECK ("doctor_payout"."period_end" > "doctor_payout"."period_start"),
	CONSTRAINT "doctor_payout_net_chk" CHECK ("doctor_payout"."net_amount" = "doctor_payout"."gross_amount" + "doctor_payout"."adjustment_amount")
);
--> statement-breakpoint
CREATE TABLE "doctor_payout_adjustment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"source_payout_id" uuid NOT NULL,
	"doctor_payout_item_id" uuid,
	"appointment_id" uuid,
	"payment_id" uuid,
	"type" "doctor_payout_adjustment_type_enum" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"reason" text NOT NULL,
	"created_by_type" "audit_actor_type_enum" NOT NULL,
	"created_by_user_id" uuid,
	"external_reference" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_payout_adjustment_amount_chk" CHECK ("doctor_payout_adjustment"."amount" <> 0),
	CONSTRAINT "doctor_payout_adjustment_creator_chk" CHECK (("doctor_payout_adjustment"."created_by_type" = 'user' and "doctor_payout_adjustment"."created_by_user_id" is not null) or ("doctor_payout_adjustment"."created_by_type" = 'system' and "doctor_payout_adjustment"."created_by_user_id" is null))
);
--> statement-breakpoint
CREATE TABLE "doctor_payout_adjustment_application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adjustment_id" uuid NOT NULL,
	"applied_payout_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_payout_adjustment_application_amount_chk" CHECK ("doctor_payout_adjustment_application"."amount" <> 0)
);
--> statement-breakpoint
CREATE TABLE "doctor_payout_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payout_id" uuid,
	"payment_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"eligible_at" timestamp with time zone NOT NULL,
	"eligibility_status" "doctor_payout_item_eligibility_enum" DEFAULT 'eligible' NOT NULL,
	"eligibility_revoked_at" timestamp with time zone,
	"eligibility_revoked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_payout_item_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "doctor_payout_item_revoked_chk" CHECK ("doctor_payout_item"."eligibility_status" <> 'revoked' or "doctor_payout_item"."eligibility_revoked_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "appointment_reminder_configuration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"minutes_before" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cancellation_policy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refund_deadline_hours" integer NOT NULL,
	"max_reschedules" integer NOT NULL,
	"doctor_wait_minutes" integer NOT NULL,
	"patient_tolerance_minutes" integer NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consultation_price_configuration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'MXN' NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pickup_configuration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pickup_expiration_days" integer NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_profile_id" uuid NOT NULL,
	"type" "notification_type_enum" NOT NULL,
	"title" varchar NOT NULL,
	"body" text NOT NULL,
	"data" jsonb,
	"is_critical" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"channel" "notification_channel_enum" NOT NULL,
	"status" "notification_delivery_status_enum" DEFAULT 'pending' NOT NULL,
	"delivery_key" varchar NOT NULL,
	"push_notification_token_id" uuid,
	"provider_message_id" varchar,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_delivery_delivery_key_unique" UNIQUE("delivery_key")
);
--> statement-breakpoint
CREATE TABLE "notification_preference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_profile_id" uuid NOT NULL,
	"notification_type" "notification_type_enum" NOT NULL,
	"in_app_enabled" boolean DEFAULT true NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_notification_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_profile_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" varchar,
	"app_identifier" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_notification_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "support_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medication_order_id" uuid,
	"appointment_id" uuid,
	"opened_by_type" "cancellation_actor_type_enum" NOT NULL,
	"opened_by_user_profile_id" uuid,
	"status" "support_request_status_enum" DEFAULT 'open' NOT NULL,
	"reason" varchar NOT NULL,
	"description" text,
	"response" text,
	"resolution" text,
	"incident_cause" "support_incident_cause_enum",
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_request_reference_chk" CHECK ("support_request"."medication_order_id" is not null or "support_request"."appointment_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "appointment_no_show_prediction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"probability" numeric(5, 4) NOT NULL,
	"risk_level" "risk_level_enum" NOT NULL,
	"model_version" varchar NOT NULL,
	"predicted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_adherence_segment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"segment" varchar NOT NULL,
	"model_version" varchar NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinical_record_consent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"granted" boolean NOT NULL,
	"scope" jsonb NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"consent_text_version" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinical_record_consent_appointment_id_unique" UNIQUE("appointment_id")
);
--> statement-breakpoint
CREATE TABLE "legal_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "legal_document_type_enum" NOT NULL,
	"version" varchar NOT NULL,
	"content" text NOT NULL,
	"content_hash" varchar,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_legal_acceptance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_profile_id" uuid NOT NULL,
	"legal_document_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_profile_id_user_profile_id_fk" FOREIGN KEY ("actor_user_profile_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_user_profile_id_user_profile_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_health_summary" ADD CONSTRAINT "patient_health_summary_patient_id_patient_profile_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_identity_verification" ADD CONSTRAINT "patient_identity_verification_patient_id_patient_profile_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_identity_verification" ADD CONSTRAINT "patient_identity_verification_reviewed_by_user_profile_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_profile" ADD CONSTRAINT "patient_profile_user_profile_id_user_profile_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_availability" ADD CONSTRAINT "doctor_availability_doctor_id_doctor_profile_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctor_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_profile" ADD CONSTRAINT "doctor_profile_user_profile_id_user_profile_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_profile" ADD CONSTRAINT "doctor_profile_reviewed_by_user_profile_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_time_off" ADD CONSTRAINT "doctor_time_off_doctor_id_doctor_profile_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctor_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_medication_presentation_id_medication_presentation_id_fk" FOREIGN KEY ("medication_presentation_id") REFERENCES "public"."medication_presentation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_hold" ADD CONSTRAINT "inventory_hold_inventory_id_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_hold" ADD CONSTRAINT "inventory_hold_medication_order_id_medication_order_id_fk" FOREIGN KEY ("medication_order_id") REFERENCES "public"."medication_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_hold" ADD CONSTRAINT "inventory_hold_medication_order_item_id_medication_order_item_id_fk" FOREIGN KEY ("medication_order_item_id") REFERENCES "public"."medication_order_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_inventory_id_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_medication_order_id_medication_order_id_fk" FOREIGN KEY ("medication_order_id") REFERENCES "public"."medication_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_medication_order_item_id_medication_order_item_id_fk" FOREIGN KEY ("medication_order_item_id") REFERENCES "public"."medication_order_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_performed_by_user_profile_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_presentation" ADD CONSTRAINT "medication_presentation_medication_id_medication_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medication"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_patient_id_patient_profile_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_doctor_id_doctor_profile_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctor_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_cancellation_policy_id_cancellation_policy_id_fk" FOREIGN KEY ("cancellation_policy_id") REFERENCES "public"."cancellation_policy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_cancelled_by_user_profile_id_user_profile_id_fk" FOREIGN KEY ("cancelled_by_user_profile_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_rescheduled_from_appointment_id_appointment_id_fk" FOREIGN KEY ("rescheduled_from_appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_status_history" ADD CONSTRAINT "appointment_status_history_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_status_history" ADD CONSTRAINT "appointment_status_history_changed_by_user_profile_id_user_profile_id_fk" FOREIGN KEY ("changed_by_user_profile_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_session_event" ADD CONSTRAINT "meeting_session_event_meeting_id_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_document" ADD CONSTRAINT "lab_document_medical_record_id_medical_record_id_fk" FOREIGN KEY ("medical_record_id") REFERENCES "public"."medical_record"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_document" ADD CONSTRAINT "lab_document_uploaded_by_user_profile_id_user_profile_id_fk" FOREIGN KEY ("uploaded_by_user_profile_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_record" ADD CONSTRAINT "medical_record_patient_id_patient_profile_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_record_entry" ADD CONSTRAINT "medical_record_entry_medical_record_id_medical_record_id_fk" FOREIGN KEY ("medical_record_id") REFERENCES "public"."medical_record"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_record_entry" ADD CONSTRAINT "medical_record_entry_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_record_entry" ADD CONSTRAINT "medical_record_entry_authored_by_doctor_profile_id_fk" FOREIGN KEY ("authored_by") REFERENCES "public"."doctor_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_medical_record_id_medical_record_id_fk" FOREIGN KEY ("medical_record_id") REFERENCES "public"."medical_record"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_doctor_id_doctor_profile_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctor_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_item" ADD CONSTRAINT "prescription_item_prescription_id_prescription_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescription"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_item" ADD CONSTRAINT "prescription_item_medication_presentation_id_medication_presentation_id_fk" FOREIGN KEY ("medication_presentation_id") REFERENCES "public"."medication_presentation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_item_fulfillment" ADD CONSTRAINT "prescription_item_fulfillment_prescription_item_id_prescription_item_id_fk" FOREIGN KEY ("prescription_item_id") REFERENCES "public"."prescription_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_item_fulfillment" ADD CONSTRAINT "prescription_item_fulfillment_medication_order_item_id_medication_order_item_id_fk" FOREIGN KEY ("medication_order_item_id") REFERENCES "public"."medication_order_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_signature" ADD CONSTRAINT "prescription_signature_prescription_id_prescription_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescription"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_signature" ADD CONSTRAINT "prescription_signature_signed_by_doctor_id_doctor_profile_id_fk" FOREIGN KEY ("signed_by_doctor_id") REFERENCES "public"."doctor_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart" ADD CONSTRAINT "cart_patient_id_patient_profile_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_item" ADD CONSTRAINT "cart_item_cart_id_cart_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."cart"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_item" ADD CONSTRAINT "cart_item_prescription_item_id_prescription_item_id_fk" FOREIGN KEY ("prescription_item_id") REFERENCES "public"."prescription_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_order" ADD CONSTRAINT "medication_order_patient_id_patient_profile_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_order" ADD CONSTRAINT "medication_order_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_order" ADD CONSTRAINT "medication_order_cancelled_by_user_profile_id_user_profile_id_fk" FOREIGN KEY ("cancelled_by_user_profile_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_order_item" ADD CONSTRAINT "medication_order_item_order_id_medication_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."medication_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_order_item" ADD CONSTRAINT "medication_order_item_prescription_item_id_prescription_item_id_fk" FOREIGN KEY ("prescription_item_id") REFERENCES "public"."prescription_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_order_item" ADD CONSTRAINT "medication_order_item_medication_presentation_id_medication_presentation_id_fk" FOREIGN KEY ("medication_presentation_id") REFERENCES "public"."medication_presentation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_medication_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."medication_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_user_profile_id_user_profile_id_fk" FOREIGN KEY ("changed_by_user_profile_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_dispensation" ADD CONSTRAINT "treatment_dispensation_order_id_medication_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."medication_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_dispensation" ADD CONSTRAINT "treatment_dispensation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_dispensation" ADD CONSTRAINT "treatment_dispensation_packed_by_user_profile_id_fk" FOREIGN KEY ("packed_by") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_doctor_id_doctor_profile_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctor_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_patient_id_patient_profile_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_medication_order_id_medication_order_id_fk" FOREIGN KEY ("medication_order_id") REFERENCES "public"."medication_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_requested_by_user_profile_id_user_profile_id_fk" FOREIGN KEY ("requested_by_user_profile_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_approved_by_user_profile_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_connect_account" ADD CONSTRAINT "stripe_connect_account_doctor_id_doctor_profile_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctor_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_payment_method" ADD CONSTRAINT "stripe_payment_method_patient_id_patient_profile_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_commission_configuration" ADD CONSTRAINT "consultation_commission_configuration_created_by_user_profile_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_payout" ADD CONSTRAINT "doctor_payout_doctor_id_doctor_profile_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctor_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_payout_adjustment" ADD CONSTRAINT "doctor_payout_adjustment_doctor_id_doctor_profile_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctor_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_payout_adjustment" ADD CONSTRAINT "doctor_payout_adjustment_source_payout_id_doctor_payout_id_fk" FOREIGN KEY ("source_payout_id") REFERENCES "public"."doctor_payout"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_payout_adjustment" ADD CONSTRAINT "doctor_payout_adjustment_doctor_payout_item_id_doctor_payout_item_id_fk" FOREIGN KEY ("doctor_payout_item_id") REFERENCES "public"."doctor_payout_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_payout_adjustment" ADD CONSTRAINT "doctor_payout_adjustment_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_payout_adjustment" ADD CONSTRAINT "doctor_payout_adjustment_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_payout_adjustment" ADD CONSTRAINT "doctor_payout_adjustment_created_by_user_id_user_profile_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_payout_adjustment_application" ADD CONSTRAINT "doctor_payout_adjustment_application_adjustment_id_doctor_payout_adjustment_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."doctor_payout_adjustment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_payout_adjustment_application" ADD CONSTRAINT "doctor_payout_adjustment_application_applied_payout_id_doctor_payout_id_fk" FOREIGN KEY ("applied_payout_id") REFERENCES "public"."doctor_payout"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_payout_item" ADD CONSTRAINT "doctor_payout_item_payout_id_doctor_payout_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."doctor_payout"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_payout_item" ADD CONSTRAINT "doctor_payout_item_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_reminder_configuration" ADD CONSTRAINT "appointment_reminder_configuration_created_by_user_profile_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellation_policy" ADD CONSTRAINT "cancellation_policy_created_by_user_profile_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_price_configuration" ADD CONSTRAINT "consultation_price_configuration_created_by_user_profile_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_configuration" ADD CONSTRAINT "pickup_configuration_created_by_user_profile_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipient_user_profile_id_user_profile_id_fk" FOREIGN KEY ("recipient_user_profile_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_notification_id_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notification"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_push_notification_token_id_push_notification_token_id_fk" FOREIGN KEY ("push_notification_token_id") REFERENCES "public"."push_notification_token"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_user_profile_id_user_profile_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_notification_token" ADD CONSTRAINT "push_notification_token_user_profile_id_user_profile_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_medication_order_id_medication_order_id_fk" FOREIGN KEY ("medication_order_id") REFERENCES "public"."medication_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_opened_by_user_profile_id_user_profile_id_fk" FOREIGN KEY ("opened_by_user_profile_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_resolved_by_user_profile_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_no_show_prediction" ADD CONSTRAINT "appointment_no_show_prediction_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_adherence_segment" ADD CONSTRAINT "patient_adherence_segment_patient_id_patient_profile_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_record_consent" ADD CONSTRAINT "clinical_record_consent_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_legal_acceptance" ADD CONSTRAINT "user_legal_acceptance_user_profile_id_user_profile_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_legal_acceptance" ADD CONSTRAINT "user_legal_acceptance_legal_document_id_legal_document_id_fk" FOREIGN KEY ("legal_document_id") REFERENCES "public"."legal_document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_user_profile_id");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "audit_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "doctor_availability_doctor_idx" ON "doctor_availability" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "doctor_availability_doctor_weekday_idx" ON "doctor_availability" USING btree ("doctor_id","weekday");--> statement-breakpoint
CREATE INDEX "doctor_time_off_doctor_idx" ON "doctor_time_off" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "doctor_time_off_start_idx" ON "doctor_time_off" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "inventory_presentation_idx" ON "inventory" USING btree ("medication_presentation_id");--> statement-breakpoint
CREATE INDEX "inventory_owner_presentation_idx" ON "inventory" USING btree ("organization_id","medication_presentation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_platform_presentation_uq" ON "inventory" USING btree ("medication_presentation_id") WHERE "inventory"."organization_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_organization_presentation_uq" ON "inventory" USING btree ("organization_id","medication_presentation_id") WHERE "inventory"."organization_id" is not null;--> statement-breakpoint
CREATE INDEX "inventory_hold_inventory_idx" ON "inventory_hold" USING btree ("inventory_id");--> statement-breakpoint
CREATE INDEX "inventory_hold_order_idx" ON "inventory_hold" USING btree ("medication_order_id");--> statement-breakpoint
CREATE INDEX "inventory_hold_expires_idx" ON "inventory_hold" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "inventory_movement_inventory_idx" ON "inventory_movement" USING btree ("inventory_id");--> statement-breakpoint
CREATE INDEX "inventory_movement_order_idx" ON "inventory_movement" USING btree ("medication_order_id");--> statement-breakpoint
CREATE INDEX "inventory_movement_created_idx" ON "inventory_movement" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "medication_presentation_medication_idx" ON "medication_presentation" USING btree ("medication_id");--> statement-breakpoint
CREATE UNIQUE INDEX "medication_presentation_name_uq" ON "medication_presentation" USING btree ("medication_id","name");--> statement-breakpoint
CREATE INDEX "appointment_doctor_idx" ON "appointment" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "appointment_patient_idx" ON "appointment" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "appointment_scheduled_at_idx" ON "appointment" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "appointment_doctor_schedule_idx" ON "appointment" USING btree ("doctor_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "appointment_payment_hold_idx" ON "appointment" USING btree ("payment_hold_expires_at");--> statement-breakpoint
CREATE INDEX "appointment_status_history_appointment_idx" ON "appointment_status_history" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "appointment_status_history_created_idx" ON "appointment_status_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "meeting_session_event_meeting_idx" ON "meeting_session_event" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meeting_session_event_occurred_idx" ON "meeting_session_event" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "lab_document_record_idx" ON "lab_document" USING btree ("medical_record_id");--> statement-breakpoint
CREATE INDEX "medical_record_entry_record_idx" ON "medical_record_entry" USING btree ("medical_record_id");--> statement-breakpoint
CREATE INDEX "medical_record_entry_appointment_idx" ON "medical_record_entry" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "medical_record_entry_author_idx" ON "medical_record_entry" USING btree ("authored_by");--> statement-breakpoint
CREATE INDEX "prescription_record_idx" ON "prescription" USING btree ("medical_record_id");--> statement-breakpoint
CREATE INDEX "prescription_doctor_idx" ON "prescription" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "prescription_appointment_idx" ON "prescription" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "prescription_status_idx" ON "prescription" USING btree ("status");--> statement-breakpoint
CREATE INDEX "prescription_valid_until_idx" ON "prescription" USING btree ("valid_until");--> statement-breakpoint
CREATE INDEX "prescription_item_prescription_idx" ON "prescription_item" USING btree ("prescription_id");--> statement-breakpoint
CREATE INDEX "prescription_item_presentation_idx" ON "prescription_item" USING btree ("medication_presentation_id");--> statement-breakpoint
CREATE INDEX "prescription_item_prescription_presentation_idx" ON "prescription_item" USING btree ("prescription_id","medication_presentation_id");--> statement-breakpoint
CREATE INDEX "prescription_fulfillment_prescription_item_idx" ON "prescription_item_fulfillment" USING btree ("prescription_item_id");--> statement-breakpoint
CREATE INDEX "prescription_fulfillment_order_item_idx" ON "prescription_item_fulfillment" USING btree ("medication_order_item_id");--> statement-breakpoint
CREATE INDEX "cart_item_cart_idx" ON "cart_item" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "cart_item_prescription_item_idx" ON "cart_item" USING btree ("prescription_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cart_item_cart_prescription_item_uq" ON "cart_item" USING btree ("cart_id","prescription_item_id");--> statement-breakpoint
CREATE INDEX "medication_order_patient_idx" ON "medication_order" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "medication_order_organization_idx" ON "medication_order" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "medication_order_status_idx" ON "medication_order" USING btree ("status");--> statement-breakpoint
CREATE INDEX "medication_order_pickup_expires_idx" ON "medication_order" USING btree ("pickup_expires_at");--> statement-breakpoint
CREATE INDEX "medication_order_created_at_idx" ON "medication_order" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "medication_order_item_order_idx" ON "medication_order_item" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "medication_order_item_prescription_item_idx" ON "medication_order_item" USING btree ("prescription_item_id");--> statement-breakpoint
CREATE INDEX "medication_order_item_presentation_idx" ON "medication_order_item" USING btree ("medication_presentation_id");--> statement-breakpoint
CREATE INDEX "order_status_history_order_idx" ON "order_status_history" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_status_history_created_idx" ON "order_status_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "dispensation_organization_idx" ON "treatment_dispensation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payment_doctor_idx" ON "payment" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "payment_patient_idx" ON "payment" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "payment_appointment_idx" ON "payment" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "payment_medication_order_idx" ON "payment" USING btree ("medication_order_id");--> statement-breakpoint
CREATE INDEX "payment_type_idx" ON "payment" USING btree ("type");--> statement-breakpoint
CREATE INDEX "payment_status_idx" ON "payment" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_created_at_idx" ON "payment" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "refund_payment_idx" ON "refund" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "refund_status_idx" ON "refund" USING btree ("status");--> statement-breakpoint
CREATE INDEX "refund_created_at_idx" ON "refund" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "stripe_payment_method_patient_idx" ON "stripe_payment_method" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "stripe_payment_method_customer_idx" ON "stripe_payment_method" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "stripe_webhook_type_idx" ON "stripe_webhook_event" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "stripe_webhook_status_idx" ON "stripe_webhook_event" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stripe_webhook_received_idx" ON "stripe_webhook_event" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "commission_config_effective_from_idx" ON "consultation_commission_configuration" USING btree ("effective_from");--> statement-breakpoint
CREATE INDEX "doctor_payout_doctor_idx" ON "doctor_payout" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "doctor_payout_status_idx" ON "doctor_payout" USING btree ("status");--> statement-breakpoint
CREATE INDEX "doctor_payout_period_start_idx" ON "doctor_payout" USING btree ("period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "doctor_payout_period_uq" ON "doctor_payout" USING btree ("doctor_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "doctor_payout_adjustment_doctor_idx" ON "doctor_payout_adjustment" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "doctor_payout_adjustment_source_idx" ON "doctor_payout_adjustment" USING btree ("source_payout_id");--> statement-breakpoint
CREATE INDEX "doctor_payout_adjustment_payment_idx" ON "doctor_payout_adjustment" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "doctor_payout_adjustment_application_adjustment_idx" ON "doctor_payout_adjustment_application" USING btree ("adjustment_id");--> statement-breakpoint
CREATE INDEX "doctor_payout_adjustment_application_payout_idx" ON "doctor_payout_adjustment_application" USING btree ("applied_payout_id");--> statement-breakpoint
CREATE INDEX "doctor_payout_item_payout_idx" ON "doctor_payout_item" USING btree ("payout_id");--> statement-breakpoint
CREATE INDEX "doctor_payout_item_payment_idx" ON "doctor_payout_item" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "doctor_payout_item_eligible_at_idx" ON "doctor_payout_item" USING btree ("eligible_at");--> statement-breakpoint
CREATE INDEX "doctor_payout_item_eligibility_idx" ON "doctor_payout_item" USING btree ("eligibility_status");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_reminder_minutes_uq" ON "appointment_reminder_configuration" USING btree ("minutes_before");--> statement-breakpoint
CREATE INDEX "cancellation_policy_effective_from_idx" ON "cancellation_policy" USING btree ("effective_from");--> statement-breakpoint
CREATE INDEX "consultation_price_effective_from_idx" ON "consultation_price_configuration" USING btree ("effective_from");--> statement-breakpoint
CREATE INDEX "pickup_config_effective_from_idx" ON "pickup_configuration" USING btree ("effective_from");--> statement-breakpoint
CREATE INDEX "notification_recipient_idx" ON "notification" USING btree ("recipient_user_profile_id");--> statement-breakpoint
CREATE INDEX "notification_type_idx" ON "notification" USING btree ("type");--> statement-breakpoint
CREATE INDEX "notification_read_idx" ON "notification" USING btree ("read_at");--> statement-breakpoint
CREATE INDEX "notification_created_idx" ON "notification" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notification_delivery_notification_idx" ON "notification_delivery" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "notification_delivery_status_idx" ON "notification_delivery" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preference_uq" ON "notification_preference" USING btree ("user_profile_id","notification_type");--> statement-breakpoint
CREATE INDEX "push_token_user_idx" ON "push_notification_token" USING btree ("user_profile_id");--> statement-breakpoint
CREATE INDEX "push_token_active_idx" ON "push_notification_token" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "support_request_order_idx" ON "support_request" USING btree ("medication_order_id");--> statement-breakpoint
CREATE INDEX "support_request_appointment_idx" ON "support_request" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "support_request_status_idx" ON "support_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "support_request_created_idx" ON "support_request" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "support_request_open_per_order_uq" ON "support_request" USING btree ("medication_order_id") WHERE "support_request"."medication_order_id" is not null and "support_request"."status" in ('open', 'in_review');--> statement-breakpoint
CREATE INDEX "no_show_prediction_appointment_idx" ON "appointment_no_show_prediction" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "no_show_prediction_predicted_idx" ON "appointment_no_show_prediction" USING btree ("predicted_at");--> statement-breakpoint
CREATE INDEX "adherence_segment_patient_idx" ON "patient_adherence_segment" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "adherence_segment_assigned_idx" ON "patient_adherence_segment" USING btree ("assigned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_document_type_version_uq" ON "legal_document" USING btree ("type","version");--> statement-breakpoint
CREATE UNIQUE INDEX "user_legal_acceptance_uq" ON "user_legal_acceptance" USING btree ("user_profile_id","legal_document_id");--> statement-breakpoint
CREATE INDEX "user_legal_acceptance_user_idx" ON "user_legal_acceptance" USING btree ("user_profile_id");
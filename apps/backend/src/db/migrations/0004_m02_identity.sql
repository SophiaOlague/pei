-- PEI — M02 Identity. Generada con drizzle-kit a partir de schema.ts; los tres RENAME COLUMN se agregaron a mano
-- para conservar los datos (drizzle-kit pregunta de forma interactiva si es un renombre o un DROP + ADD).
-- Requisito previo (DT-22): ninguna CURP existente puede incumplir el formato; si alguna lo incumple, el
-- ADD CONSTRAINT falla y la migración completa se revierte. El dato de desarrollo se corrige antes, fuera de esta migración.
ALTER TABLE "patient_identity_verification" RENAME COLUMN "ine_front_url" TO "ine_front_object_key";--> statement-breakpoint
ALTER TABLE "patient_identity_verification" RENAME COLUMN "ine_back_url" TO "ine_back_object_key";--> statement-breakpoint
ALTER TABLE "patient_profile" RENAME COLUMN "photo_url" TO "photo_object_key";--> statement-breakpoint
ALTER TABLE "patient_identity_verification" DROP CONSTRAINT "patient_identity_verification_patient_id_unique";--> statement-breakpoint
ALTER TABLE "patient_identity_verification" ALTER COLUMN "ine_front_object_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "patient_identity_verification" ALTER COLUMN "ine_back_object_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "patient_profile" ALTER COLUMN "curp" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "patient_identity_verification" ADD COLUMN "attempt" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "patient_identity_verification" ADD COLUMN "documents_deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "patient_identity_verification_one_pending_uq" ON "patient_identity_verification" USING btree ("patient_id") WHERE "patient_identity_verification"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "patient_identity_verification_status_created_idx" ON "patient_identity_verification" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_document_type_published_at_uq" ON "legal_document" USING btree ("type","published_at");--> statement-breakpoint
ALTER TABLE "patient_identity_verification" ADD CONSTRAINT "patient_identity_verification_patient_attempt_uq" UNIQUE("patient_id","attempt");--> statement-breakpoint
ALTER TABLE "patient_identity_verification" ADD CONSTRAINT "patient_identity_verification_pending_keys_chk" CHECK ("patient_identity_verification"."status" <> 'pending' or ("patient_identity_verification"."ine_front_object_key" is not null and "patient_identity_verification"."ine_back_object_key" is not null));--> statement-breakpoint
ALTER TABLE "patient_identity_verification" ADD CONSTRAINT "patient_identity_verification_deleted_keys_chk" CHECK ("patient_identity_verification"."documents_deleted_at" is null or ("patient_identity_verification"."ine_front_object_key" is null and "patient_identity_verification"."ine_back_object_key" is null));--> statement-breakpoint
ALTER TABLE "patient_profile" ADD CONSTRAINT "patient_profile_curp_upper_chk" CHECK ("patient_profile"."curp" = upper("patient_profile"."curp"));--> statement-breakpoint
ALTER TABLE "patient_profile" ADD CONSTRAINT "patient_profile_curp_format_chk" CHECK ("patient_profile"."curp" ~ '^[A-Z][AEIOUX][A-Z]{2}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[HMX](AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9][0-9]$');
-- ============================================================
-- PEI — M03 B2 (1/2): evolución de doctor_profile, solo eliminaciones (plan v2 §3, 0010).
-- Generada con drizzle-kit; agregado a mano solo el guard inicial (el diseño supone 0 médicos).
-- Se separa de 0011 porque drizzle-kit pregunta de forma interactiva por renombres al quitar y agregar a la vez.
-- Elimina specialty (enum → specialty_id en 0011), license_document_url (la evidencia pasa a
-- doctor_license_verification), photo_url (→ photo_object_key en 0011) y las columnas de revisión del perfil.
-- NO APLICADA: requiere revisión (sha256), ensayo BEGIN … ROLLBACK y autorización (PC-B2), junto con 0011.
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM doctor_profile) THEN
    RAISE EXCEPTION 'M03: doctor_profile tiene filas; esta migración supone 0' USING errcode = 'P0001';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "doctor_profile" DROP CONSTRAINT "doctor_profile_reviewed_by_user_profile_id_fk";
--> statement-breakpoint
ALTER TABLE "doctor_profile" ALTER COLUMN "license_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "doctor_profile" DROP COLUMN "specialty";--> statement-breakpoint
ALTER TABLE "doctor_profile" DROP COLUMN "license_document_url";--> statement-breakpoint
ALTER TABLE "doctor_profile" DROP COLUMN "photo_url";--> statement-breakpoint
ALTER TABLE "doctor_profile" DROP COLUMN "verification_status";--> statement-breakpoint
ALTER TABLE "doctor_profile" DROP COLUMN "reviewed_by";--> statement-breakpoint
ALTER TABLE "doctor_profile" DROP COLUMN "reviewed_at";--> statement-breakpoint
ALTER TABLE "doctor_profile" DROP COLUMN "rejection_reason";--> statement-breakpoint
DROP TYPE "public"."doctor_verification_status_enum";--> statement-breakpoint
DROP TYPE "public"."specialty_enum";
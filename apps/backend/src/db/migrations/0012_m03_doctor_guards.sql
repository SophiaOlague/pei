-- ============================================================
-- PEI — M03 B3: reglas de la BD para el catálogo, el perfil del médico y las revisiones de INE y cédula
-- (plan v2 §3, 0012.a y 0012.b; D-4, D-16, D-26, D-27, R-2, R-4, C-4, E.5).
-- Migración personalizada (`drizzle-kit generate --custom`): no cambia el esquema de Drizzle (snapshot igual al de 0011).
-- SQL de 0012.b sin cambios; agregado a mano solo el guard inicial: aborta si alguna de sus funciones ya existe, para que
-- CREATE OR REPLACE nunca sustituya en silencio una función con el mismo nombre.
-- Errores con P0001 (como 0005 y 0008). Ningún mensaje incluye ids ni datos personales.
-- El migrador de Drizzle la aplica dentro de una transacción: cualquier RAISE revierte TODO.
-- Inverso lógico: DROP TRIGGER de los 12 triggers y DROP FUNCTION de las 7 funciones (sin datos).
-- NO APLICADA: requiere revisión (sha256), ensayo BEGIN … ROLLBACK (0012.c) y autorización (PC-B3).
-- ============================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('gst_block_delete', 'gst_specialty_before_update', 'gst_doctor_profile_revisions',
                         'gst_doctor_identity_review_before_insert', 'gst_doctor_identity_review_before_update',
                         'gst_doctor_license_review_before_insert', 'gst_doctor_license_review_before_update')
  ) THEN
    RAISE EXCEPTION 'M03/0012: ya existe una función con el nombre de una de 0012' USING errcode = 'P0001';
  END IF;
END $$;--> statement-breakpoint
-- ── Comunes ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION gst_block_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % no admite %', TG_TABLE_NAME, TG_OP USING errcode = 'P0001';
END $$;--> statement-breakpoint
-- ── specialty ──────────────────────────────────────────────────────────
CREATE TRIGGER specialty_no_delete   BEFORE DELETE   ON specialty FOR EACH ROW       EXECUTE FUNCTION gst_block_delete();--> statement-breakpoint
CREATE TRIGGER specialty_no_truncate BEFORE TRUNCATE ON specialty FOR EACH STATEMENT EXECUTE FUNCTION gst_block_delete();--> statement-breakpoint
CREATE OR REPLACE FUNCTION gst_specialty_before_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.code IS DISTINCT FROM OLD.code OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'El id, el código y la fecha de creación de una especialidad no se pueden cambiar' USING errcode = 'P0001';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER specialty_before_update BEFORE UPDATE ON specialty FOR EACH ROW EXECUTE FUNCTION gst_specialty_before_update();--> statement-breakpoint
-- ── doctor_profile: versiones y evidencia profesional ─────────────────
CREATE OR REPLACE FUNCTION gst_doctor_profile_revisions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.identity_revision NOT IN (OLD.identity_revision, OLD.identity_revision + 1)
     OR NEW.professional_revision NOT IN (OLD.professional_revision, OLD.professional_revision + 1) THEN
    RAISE EXCEPTION 'Las versiones del médico solo aumentan de uno en uno' USING errcode = 'P0001';
  END IF;
  IF (NEW.license_number IS DISTINCT FROM OLD.license_number OR NEW.specialty_id IS DISTINCT FROM OLD.specialty_id)
     AND NEW.professional_revision <> OLD.professional_revision + 1 THEN
    RAISE EXCEPTION 'Cambiar el número de cédula o la especialidad exige una nueva versión profesional' USING errcode = 'P0001';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER doctor_profile_revisions BEFORE UPDATE ON doctor_profile FOR EACH ROW EXECUTE FUNCTION gst_doctor_profile_revisions();--> statement-breakpoint
-- ── doctor_identity_verification ──────────────────────────────────────
CREATE OR REPLACE FUNCTION gst_doctor_identity_review_before_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_current int; v_next int;
BEGIN
  SELECT identity_revision INTO v_current FROM doctor_profile WHERE id = NEW.doctor_id;
  SELECT coalesce(max(attempt), 0) + 1 INTO v_next FROM doctor_identity_verification WHERE doctor_id = NEW.doctor_id;
  IF NEW.status <> 'pending' OR NEW.documents_deleted_at IS NOT NULL
     OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.rejection_reason IS NOT NULL THEN
    RAISE EXCEPTION 'Una revisión de INE se crea pendiente y sin revisión' USING errcode = 'P0001';
  END IF;
  IF NEW.identity_revision IS DISTINCT FROM v_current THEN
    RAISE EXCEPTION 'La revisión de INE no corresponde a la versión de identidad vigente' USING errcode = 'P0001';
  END IF;
  IF NEW.attempt IS DISTINCT FROM v_next THEN
    RAISE EXCEPTION 'El intento de INE debe ser el siguiente (%)', v_next USING errcode = 'P0001';
  END IF;
  NEW.created_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION gst_doctor_identity_review_before_update() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_current int; v_max int; v_is_purge boolean;
BEGIN
  -- 1. Columnas inmutables en todo estado
  IF (NEW.id, NEW.doctor_id, NEW.attempt, NEW.identity_revision, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.doctor_id, OLD.attempt, OLD.identity_revision, OLD.created_at) THEN
    RAISE EXCEPTION 'Columnas inmutables de la revisión de INE' USING errcode = 'P0001';
  END IF;

  -- 2. ¿Purga? (claves a NULL y documents_deleted_at; nada más)
  v_is_purge := OLD.documents_deleted_at IS NULL AND NEW.documents_deleted_at IS NOT NULL;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- 3. Transición de estado: solo desde pending; la evidencia y la purga no cambian aquí
    IF OLD.status <> 'pending' OR NEW.status NOT IN ('approved','rejected','superseded') THEN
      RAISE EXCEPTION 'Transición de INE no permitida: % → %', OLD.status, NEW.status USING errcode = 'P0001';
    END IF;
    IF (NEW.ine_front_object_key, NEW.ine_back_object_key, NEW.documents_deleted_at)
       IS DISTINCT FROM (OLD.ine_front_object_key, OLD.ine_back_object_key, OLD.documents_deleted_at) THEN
      RAISE EXCEPTION 'Una transición de estado no modifica los documentos' USING errcode = 'P0001';
    END IF;
    IF NEW.status = 'superseded' AND (NEW.reviewed_by, NEW.reviewed_at, NEW.rejection_reason)
       IS DISTINCT FROM (OLD.reviewed_by, OLD.reviewed_at, OLD.rejection_reason) THEN
      RAISE EXCEPTION 'superseded no registra revisión' USING errcode = 'P0001';
    END IF;
    IF NEW.status = 'approved' AND NEW.rejection_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Una aprobación no lleva motivo' USING errcode = 'P0001';
    END IF;
    IF NEW.status IN ('approved','rejected') THEN
      SELECT identity_revision INTO v_current FROM doctor_profile WHERE id = NEW.doctor_id;
      SELECT max(attempt) INTO v_max FROM doctor_identity_verification WHERE doctor_id = NEW.doctor_id;
      IF NEW.identity_revision IS DISTINCT FROM v_current OR NEW.attempt IS DISTINCT FROM v_max THEN
        RAISE EXCEPTION 'Solo la revisión de INE vigente se puede aprobar o rechazar' USING errcode = 'P0001';
      END IF;
    END IF;
  ELSIF v_is_purge THEN
    -- 4. Purga: solo en estado terminal, solo las claves a NULL y la fecha
    IF OLD.status = 'pending' THEN
      RAISE EXCEPTION 'No se puede purgar una INE pendiente' USING errcode = 'P0001';
    END IF;
    IF NEW.ine_front_object_key IS NOT NULL OR NEW.ine_back_object_key IS NOT NULL
       OR (NEW.reviewed_by, NEW.reviewed_at, NEW.rejection_reason)
          IS DISTINCT FROM (OLD.reviewed_by, OLD.reviewed_at, OLD.rejection_reason) THEN
      RAISE EXCEPTION 'La purga solo limpia las claves y registra la fecha' USING errcode = 'P0001';
    END IF;
  ELSE
    -- 5. Cualquier otra modificación: prohibida (pending incluido)
    IF (NEW.ine_front_object_key, NEW.ine_back_object_key, NEW.documents_deleted_at,
        NEW.reviewed_by, NEW.reviewed_at, NEW.rejection_reason)
       IS DISTINCT FROM (OLD.ine_front_object_key, OLD.ine_back_object_key, OLD.documents_deleted_at,
        OLD.reviewed_by, OLD.reviewed_at, OLD.rejection_reason) THEN
      RAISE EXCEPTION 'Modificación no permitida de la revisión de INE' USING errcode = 'P0001';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER doctor_identity_verification_before_insert BEFORE INSERT ON doctor_identity_verification
  FOR EACH ROW EXECUTE FUNCTION gst_doctor_identity_review_before_insert();--> statement-breakpoint
CREATE TRIGGER doctor_identity_verification_before_update BEFORE UPDATE ON doctor_identity_verification
  FOR EACH ROW EXECUTE FUNCTION gst_doctor_identity_review_before_update();--> statement-breakpoint
CREATE TRIGGER doctor_identity_verification_no_delete   BEFORE DELETE   ON doctor_identity_verification FOR EACH ROW       EXECUTE FUNCTION gst_block_delete();--> statement-breakpoint
CREATE TRIGGER doctor_identity_verification_no_truncate BEFORE TRUNCATE ON doctor_identity_verification FOR EACH STATEMENT EXECUTE FUNCTION gst_block_delete();--> statement-breakpoint
-- ── doctor_license_verification ───────────────────────────────────────
CREATE OR REPLACE FUNCTION gst_doctor_license_review_before_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_rev int; v_number varchar; v_specialty uuid; v_next int;
BEGIN
  SELECT professional_revision, license_number, specialty_id INTO v_rev, v_number, v_specialty
    FROM doctor_profile WHERE id = NEW.doctor_id;
  SELECT coalesce(max(attempt), 0) + 1 INTO v_next FROM doctor_license_verification WHERE doctor_id = NEW.doctor_id;
  IF NEW.status <> 'pending' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.rejection_reason IS NOT NULL THEN
    RAISE EXCEPTION 'Una revisión de cédula se crea pendiente y sin revisión' USING errcode = 'P0001';
  END IF;
  IF NEW.professional_revision IS DISTINCT FROM v_rev THEN
    RAISE EXCEPTION 'La revisión de cédula no corresponde a la versión profesional vigente' USING errcode = 'P0001';
  END IF;
  IF NEW.license_number IS DISTINCT FROM v_number OR NEW.specialty_id IS DISTINCT FROM v_specialty THEN
    RAISE EXCEPTION 'La evidencia de la cédula debe coincidir con el perfil vigente' USING errcode = 'P0001';
  END IF;
  IF NEW.attempt IS DISTINCT FROM v_next THEN
    RAISE EXCEPTION 'El intento de cédula debe ser el siguiente (%)', v_next USING errcode = 'P0001';
  END IF;
  NEW.created_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION gst_doctor_license_review_before_update() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_current int; v_max int;
BEGIN
  -- 1. Columnas inmutables en todo estado (evidencia incluida)
  IF (NEW.id, NEW.doctor_id, NEW.attempt, NEW.professional_revision, NEW.created_at,
      NEW.reason, NEW.license_number, NEW.specialty_id, NEW.document_object_key)
     IS DISTINCT FROM (OLD.id, OLD.doctor_id, OLD.attempt, OLD.professional_revision, OLD.created_at,
      OLD.reason, OLD.license_number, OLD.specialty_id, OLD.document_object_key) THEN
    RAISE EXCEPTION 'La evidencia y la identidad de una revisión de cédula son inmutables' USING errcode = 'P0001';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- 2. Transición: solo desde pending
    IF OLD.status <> 'pending' OR NEW.status NOT IN ('approved','rejected','superseded') THEN
      RAISE EXCEPTION 'Transición de cédula no permitida: % → %', OLD.status, NEW.status USING errcode = 'P0001';
    END IF;
    IF NEW.status = 'superseded' AND (NEW.reviewed_by, NEW.reviewed_at, NEW.rejection_reason)
       IS DISTINCT FROM (OLD.reviewed_by, OLD.reviewed_at, OLD.rejection_reason) THEN
      RAISE EXCEPTION 'superseded no registra revisión' USING errcode = 'P0001';
    END IF;
    IF NEW.status = 'approved' AND NEW.rejection_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Una aprobación no lleva motivo' USING errcode = 'P0001';
    END IF;
    IF NEW.status IN ('approved','rejected') THEN
      SELECT professional_revision INTO v_current FROM doctor_profile WHERE id = NEW.doctor_id;
      SELECT max(attempt) INTO v_max FROM doctor_license_verification WHERE doctor_id = NEW.doctor_id;
      IF NEW.professional_revision IS DISTINCT FROM v_current OR NEW.attempt IS DISTINCT FROM v_max THEN
        RAISE EXCEPTION 'Solo la revisión de cédula vigente se puede aprobar o rechazar' USING errcode = 'P0001';
      END IF;
    END IF;
  ELSIF (NEW.reviewed_by, NEW.reviewed_at, NEW.rejection_reason)
        IS DISTINCT FROM (OLD.reviewed_by, OLD.reviewed_at, OLD.rejection_reason) THEN
    -- 3. Sin cambio de estado no se modifica nada (pending ni terminal). La cédula no tiene purga.
    RAISE EXCEPTION 'Modificación no permitida de la revisión de cédula' USING errcode = 'P0001';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER doctor_license_verification_before_insert BEFORE INSERT ON doctor_license_verification
  FOR EACH ROW EXECUTE FUNCTION gst_doctor_license_review_before_insert();--> statement-breakpoint
CREATE TRIGGER doctor_license_verification_before_update BEFORE UPDATE ON doctor_license_verification
  FOR EACH ROW EXECUTE FUNCTION gst_doctor_license_review_before_update();--> statement-breakpoint
CREATE TRIGGER doctor_license_verification_no_delete   BEFORE DELETE   ON doctor_license_verification FOR EACH ROW       EXECUTE FUNCTION gst_block_delete();--> statement-breakpoint
CREATE TRIGGER doctor_license_verification_no_truncate BEFORE TRUNCATE ON doctor_license_verification FOR EACH STATEMENT EXECUTE FUNCTION gst_block_delete();

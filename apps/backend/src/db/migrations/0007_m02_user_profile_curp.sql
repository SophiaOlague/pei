-- ============================================================
-- PEI — M03 A3 (incremento de M02): la CURP pasa de patient_profile a user_profile (R-12, D-20, D-35).
-- Generada con drizzle-kit y editada a mano para el orden seguro:
--   precondiciones → columna nueva → copia → verificación → restricciones → retiro de la columna anterior.
-- El migrador de Drizzle la aplica dentro de una transacción: cualquier RAISE revierte TODO, incluida la copia.
-- Ningún mensaje incluye valores de CURP: solo conteos.
-- ============================================================

-- 0. Sin esperas indefinidas y sin escrituras concurrentes en las dos tablas mientras se traslada el dato.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
LOCK TABLE "user_profile", "patient_profile" IN ACCESS EXCLUSIVE MODE;--> statement-breakpoint

-- 1. Precondiciones: si alguna falla, no se ejecuta ninguna operación (ni la copia ni el retiro).
DO $$
DECLARE
  v_column_exists int;
  v_null_curp int;
  v_dup_exact int;
  v_dup_normalized int;
  v_incompatible int;
  v_orphan_patient int;
  v_patient_wrong_role int;
  v_patient_role_without_profile int;
  v_profile_with_two_patients int;
  v_doctors int;
BEGIN
  SELECT count(*) INTO v_column_exists FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'user_profile' AND column_name = 'curp';
  SELECT count(*) INTO v_null_curp FROM patient_profile WHERE curp IS NULL;
  SELECT count(*) INTO v_dup_exact FROM (SELECT curp FROM patient_profile GROUP BY curp HAVING count(*) > 1) d;
  SELECT count(*) INTO v_dup_normalized FROM (SELECT upper(btrim(curp)) FROM patient_profile GROUP BY 1 HAVING count(*) > 1) d;
  SELECT count(*) INTO v_incompatible FROM patient_profile
   WHERE curp IS NOT NULL AND (
         curp <> upper(curp) OR curp <> btrim(curp) OR char_length(curp) <> 18
      OR curp !~ '^[A-Z][AEIOUX][A-Z]{2}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[HMX](AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9][0-9]$');
  SELECT count(*) INTO v_orphan_patient FROM patient_profile pp
   WHERE NOT EXISTS (SELECT 1 FROM user_profile up WHERE up.id = pp.user_profile_id);
  SELECT count(*) INTO v_patient_wrong_role FROM patient_profile pp JOIN user_profile up ON up.id = pp.user_profile_id
   WHERE up.role <> 'patient';
  SELECT count(*) INTO v_patient_role_without_profile FROM user_profile up
   WHERE up.role = 'patient' AND NOT EXISTS (SELECT 1 FROM patient_profile pp WHERE pp.user_profile_id = up.id);
  SELECT count(*) INTO v_profile_with_two_patients FROM (SELECT user_profile_id FROM patient_profile GROUP BY 1 HAVING count(*) > 1) d;
  SELECT count(*) INTO v_doctors FROM user_profile WHERE role = 'doctor';

  IF v_column_exists + v_null_curp + v_dup_exact + v_dup_normalized + v_incompatible + v_orphan_patient
     + v_patient_wrong_role + v_patient_role_without_profile + v_profile_with_two_patients + v_doctors > 0 THEN
    RAISE EXCEPTION 'A3/0007 precondiciones: columna_existe=%, curp_nula=%, duplicadas=%, duplicadas_normalizadas=%, incompatibles=%, pacientes_huerfanos=%, paciente_con_rol_distinto=%, rol_paciente_sin_perfil=%, perfil_con_dos_pacientes=%, medicos=%',
      v_column_exists, v_null_curp, v_dup_exact, v_dup_normalized, v_incompatible, v_orphan_patient,
      v_patient_wrong_role, v_patient_role_without_profile, v_profile_with_two_patients, v_doctors
      USING errcode = 'P0001';
  END IF;
END $$;--> statement-breakpoint

-- 2. Columna nueva, sin restricciones todavía (admite nulos mientras se copia).
ALTER TABLE "user_profile" ADD COLUMN "curp" varchar;--> statement-breakpoint

-- 3. Copia 1:1 por la relación patient_profile.user_profile_id → user_profile.id (UNIQUE y FK existentes).
UPDATE "user_profile" up
   SET "curp" = pp."curp"
  FROM "patient_profile" pp
 WHERE pp."user_profile_id" = up."id";--> statement-breakpoint

-- 4. Verificación de la copia, antes de cualquier restricción o retiro.
DO $$
DECLARE
  v_source int;
  v_copied int;
  v_mismatch int;
  v_extra int;
  v_required_missing int;
  v_dup_target int;
BEGIN
  SELECT count(*) INTO v_source FROM patient_profile;
  SELECT count(*) INTO v_copied FROM user_profile WHERE curp IS NOT NULL;
  SELECT count(*) INTO v_mismatch FROM patient_profile pp JOIN user_profile up ON up.id = pp.user_profile_id
   WHERE up.curp IS DISTINCT FROM pp.curp;
  SELECT count(*) INTO v_extra FROM user_profile up
   WHERE up.curp IS NOT NULL AND NOT EXISTS (SELECT 1 FROM patient_profile pp WHERE pp.user_profile_id = up.id);
  SELECT count(*) INTO v_required_missing FROM user_profile WHERE role IN ('patient', 'doctor') AND curp IS NULL;
  SELECT count(*) INTO v_dup_target FROM (SELECT curp FROM user_profile WHERE curp IS NOT NULL GROUP BY curp HAVING count(*) > 1) d;

  IF v_copied <> v_source OR v_mismatch > 0 OR v_extra > 0 OR v_required_missing > 0 OR v_dup_target > 0 THEN
    RAISE EXCEPTION 'A3/0007 verificación de la copia: origen=%, copiadas=%, distintas=%, sobrantes=%, obligatorias_sin_curp=%, duplicadas_destino=%',
      v_source, v_copied, v_mismatch, v_extra, v_required_missing, v_dup_target
      USING errcode = 'P0001';
  END IF;
END $$;--> statement-breakpoint

-- 5. Restricciones en la nueva fuente única (DT-22 se conserva; D-20/D-35: única entre roles).
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_curp_unique" UNIQUE("curp");--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_curp_upper_chk" CHECK ("user_profile"."curp" = upper("user_profile"."curp"));--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_curp_format_chk" CHECK ("user_profile"."curp" ~ '^[A-Z][AEIOUX][A-Z]{2}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[HMX](AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9][0-9]$');--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_curp_required_chk" CHECK ("user_profile"."role" not in ('patient', 'doctor') or "user_profile"."curp" is not null);--> statement-breakpoint

-- 6. Retiro de la fuente anterior: solo se llega aquí si 1, 4 y 5 terminaron sin error.
ALTER TABLE "patient_profile" DROP CONSTRAINT "patient_profile_curp_unique";--> statement-breakpoint
ALTER TABLE "patient_profile" DROP CONSTRAINT "patient_profile_curp_upper_chk";--> statement-breakpoint
ALTER TABLE "patient_profile" DROP CONSTRAINT "patient_profile_curp_format_chk";--> statement-breakpoint
ALTER TABLE "patient_profile" DROP COLUMN "curp";

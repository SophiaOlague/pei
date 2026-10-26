-- ============================================================
-- PEI — M03 A4 (incremento de M02, M02-7): coherencia entre el rol de user_profile y su perfil de dominio
-- (R-10; RN-001, RN-139; Maestro V2.3 §7.2, C-15).
--   patient_profile solo para user_profile con rol 'patient'; doctor_profile solo para rol 'doctor'.
-- Migración personalizada: no cambia el esquema de Drizzle (snapshot idéntico al de 0007).
-- La exclusividad paciente/médico se deduce: el rol es inmutable (0005, A7) y cada perfil exige su rol,
-- así que una cuenta no puede tener ambos perfiles. No hace falta un trigger cruzado.
-- Errores con P0001 (D-A4-1), como 0005. Ningún mensaje incluye ids ni datos personales: solo conteos.
-- El migrador de Drizzle la aplica dentro de una transacción: cualquier RAISE revierte TODO.
-- Inverso lógico: DROP TRIGGER patient_profile_role_matches ON patient_profile;
--                 DROP TRIGGER doctor_profile_role_matches ON doctor_profile;
--                 DROP FUNCTION gst_profile_role_matches();
-- ============================================================

-- 0. Sin esperas indefinidas; bloquea escrituras concurrentes en las tres tablas mientras se comprueba y se crean los triggers.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
LOCK TABLE "user_profile", "patient_profile", "doctor_profile" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint

-- 1. Precondiciones: los datos existentes ya cumplen la regla. Si no, no se crea nada.
DO $$
DECLARE
  v_patient_wrong_role int;
  v_doctor_wrong_role int;
  v_profile_with_both int;
BEGIN
  SELECT count(*) INTO v_patient_wrong_role FROM patient_profile pp JOIN user_profile up ON up.id = pp.user_profile_id
   WHERE up.role <> 'patient';
  SELECT count(*) INTO v_doctor_wrong_role FROM doctor_profile dp JOIN user_profile up ON up.id = dp.user_profile_id
   WHERE up.role <> 'doctor';
  SELECT count(*) INTO v_profile_with_both FROM patient_profile pp JOIN doctor_profile dp ON dp.user_profile_id = pp.user_profile_id;

  IF v_patient_wrong_role + v_doctor_wrong_role + v_profile_with_both > 0 THEN
    RAISE EXCEPTION 'A4/0008 precondiciones: paciente_con_rol_distinto=%, medico_con_rol_distinto=%, perfil_con_ambos=%',
      v_patient_wrong_role, v_doctor_wrong_role, v_profile_with_both
      USING errcode = 'P0001';
  END IF;
END $$;--> statement-breakpoint

-- 2. Función común: TG_ARGV[0] es el rol que exige la tabla del trigger.
--    Lee el rol actual; como el rol no cambia (0005), no hay carrera con un cambio de rol concurrente.
CREATE OR REPLACE FUNCTION gst_profile_role_matches() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_role role_enum;
BEGIN
  SELECT role INTO v_role FROM user_profile WHERE id = NEW.user_profile_id;
  -- Sin user_profile, la FK rechaza la fila; aquí solo se comprueba el rol.
  IF v_role IS NOT NULL AND v_role::text <> TG_ARGV[0] THEN
    RAISE EXCEPTION 'El perfil de dominio no corresponde al rol del usuario'
      USING errcode = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER patient_profile_role_matches
  BEFORE INSERT OR UPDATE OF user_profile_id ON patient_profile
  FOR EACH ROW EXECUTE FUNCTION gst_profile_role_matches('patient');--> statement-breakpoint

CREATE TRIGGER doctor_profile_role_matches
  BEFORE INSERT OR UPDATE OF user_profile_id ON doctor_profile
  FOR EACH ROW EXECUTE FUNCTION gst_profile_role_matches('doctor');

-- ============================================================================================================
-- Reversión de 0014 (M-1 parte B). Se pierden las referencias legales guardadas: exportarlas antes si hubiera
-- citas reales. Restaura LITERALMENTE gst_appointment_guard de 0013 (texto copiado de 0013_m08_m1_core.up.sql;
-- TC-M08-307 lo comprueba con el md5 de pg_get_functiondef). Después de esta reversión, 0013 down vuelve a admitirse.
-- ============================================================================================================

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'appointment' and column_name = 'privacy_legal_acceptance_id')
     or not exists (select 1 from information_schema.columns where table_name = 'appointment' and column_name = 'terms_legal_acceptance_id') then
    raise exception '0014 no está aplicada' using errcode = 'P0001';
  end if;
end $$;

-- 3: el guard de 0013, antes de quitar las columnas a las que se refiere la versión de 0014.
create or replace function gst_appointment_guard() returns trigger
language plpgsql as $$
declare
  allowed text[];
  old_j jsonb := to_jsonb(old);
  new_j jsonb := to_jsonb(new);
begin
  if new.cancellation_policy_id is distinct from old.cancellation_policy_id then
    raise exception 'La política aplicada a la cita % no puede cambiar después de reservar', old.id using errcode = 'P0001';
  end if;
  if new.price is distinct from old.price then
    raise exception 'El precio aplicado a la cita % no puede cambiar (RN-007)', old.id using errcode = 'P0001';
  end if;
  if new.patient_id is distinct from old.patient_id or new.doctor_id is distinct from old.doctor_id then
    raise exception 'El paciente y el médico de la cita % no pueden cambiar', old.id using errcode = 'P0001';
  end if;
  if new.scheduled_at is distinct from old.scheduled_at then
    raise exception 'La hora de la cita % no cambia: reagendar crea otra cita (RN-015)', old.id using errcode = 'P0001';
  end if;
  if old_j->>'agenda_block_ends_at' is not null and (new_j->>'agenda_block_ends_at') is distinct from (old_j->>'agenda_block_ends_at') then
    raise exception 'El fin del bloque de la cita % no puede cambiar', old.id using errcode = 'P0001';
  end if;
  if old_j->>'legal_acceptance_id' is not null and (new_j->>'legal_acceptance_id') is distinct from (old_j->>'legal_acceptance_id') then
    raise exception 'La aceptación legal de la cita % no puede cambiar', old.id using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status then
    allowed := case old.status::text
      when 'pending_payment' then array['confirmed', 'expired']
      when 'confirmed'       then array['canceled', 'rescheduled', 'completed', 'no_show_patient', 'no_show_doctor', 'no_show_both']
      -- RN-027: el administrador corrige una inasistencia con causa justificada.
      when 'no_show_patient' then array['no_show_doctor', 'no_show_both', 'completed']
      when 'no_show_doctor'  then array['no_show_patient', 'no_show_both', 'completed']
      when 'no_show_both'    then array['no_show_patient', 'no_show_doctor', 'completed']
      -- expired, canceled, completed y rescheduled son terminales.
      else array[]::text[]
    end;
    if not (new.status::text = any (allowed)) then
      raise exception 'Transición de cita no permitida: % → %', old.status, new.status using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- 2
drop trigger appointment_legal_acceptances_check on appointment;
drop function gst_appointment_legal_acceptances_check();

-- 1 (las FK se eliminan con sus columnas)
alter table appointment drop constraint appointment_legal_acceptances_chk;
drop index appointment_terms_legal_acceptance_idx;
drop index appointment_privacy_legal_acceptance_idx;
alter table appointment drop column terms_legal_acceptance_id;
alter table appointment drop column privacy_legal_acceptance_id;

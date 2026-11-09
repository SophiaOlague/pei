-- ============================================================================================================
-- M-1 (M08 Citas) · Parte B, DEPENDIENTE DE M02 (C-32, AP-19, AP-26) · PROPUESTA, NO APLICADA
-- ------------------------------------------------------------------------------------------------------------
-- La cita guarda las DOS aceptaciones legales del paciente al reservar (privacidad y términos), leídas con
-- BOOKING_LEGAL_ACCEPTANCE_READER de M02 (M08-diseno A.17). Requiere 0013. No modifica 0013: redefine
-- gst_appointment_guard con CREATE OR REPLACE, y 0014 down restaura literalmente la versión de 0013.
-- Transaccional. Las citas anteriores quedan con las dos referencias nulas.
-- ============================================================================================================

do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                  where t.typname = 'appointment_status_enum' and e.enumlabel = 'rescheduled') then
    raise exception '0014 requiere 0013 (M-1 parte A)' using errcode = 'P0001';
  end if;
  if exists (select 1 from information_schema.columns
              where table_name = 'appointment'
                and column_name in ('privacy_legal_acceptance_id', 'terms_legal_acceptance_id')) then
    raise exception '0014 ya está aplicada' using errcode = 'P0001';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------- 1
-- Dos referencias a user_legal_acceptance (solo inserción, 0001): la fila guarda versión, fecha, IP y agente.
alter table appointment add column privacy_legal_acceptance_id uuid;
alter table appointment add column terms_legal_acceptance_id uuid;
alter table appointment add constraint appointment_privacy_legal_acceptance_fk
  foreign key (privacy_legal_acceptance_id) references user_legal_acceptance (id) on delete no action on update no action;
alter table appointment add constraint appointment_terms_legal_acceptance_fk
  foreign key (terms_legal_acceptance_id) references user_legal_acceptance (id) on delete no action on update no action;
create index appointment_privacy_legal_acceptance_idx on appointment (privacy_legal_acceptance_id);
create index appointment_terms_legal_acceptance_idx on appointment (terms_legal_acceptance_id);

-- Las dos o ninguna: no puede existir evidencia legal parcial.
alter table appointment add constraint appointment_legal_acceptances_chk
  check ((privacy_legal_acceptance_id is null) = (terms_legal_acceptance_id is null));

-- ---------------------------------------------------------------------------------------------------------- 2
-- Las aceptaciones pertenecen al paciente de la cita, son del tipo correspondiente y del mismo régimen:
-- actual (privacy_policy + patient_terms) o anterior (privacy_notice + terms_and_conditions).
create function gst_appointment_legal_acceptances_check() returns trigger
language plpgsql as $$
declare
  patient_user uuid;
  privacy_user uuid;
  privacy_type text;
  terms_user uuid;
  terms_type text;
begin
  if new.privacy_legal_acceptance_id is null and new.terms_legal_acceptance_id is null then
    return new;
  end if;
  select pp.user_profile_id into patient_user from patient_profile pp where pp.id = new.patient_id;
  select a.user_profile_id, d.type::text into privacy_user, privacy_type
    from user_legal_acceptance a join legal_document d on d.id = a.legal_document_id
   where a.id = new.privacy_legal_acceptance_id;
  select a.user_profile_id, d.type::text into terms_user, terms_type
    from user_legal_acceptance a join legal_document d on d.id = a.legal_document_id
   where a.id = new.terms_legal_acceptance_id;
  if privacy_user is distinct from patient_user or terms_user is distinct from patient_user then
    raise exception 'Las aceptaciones legales de la cita % no pertenecen a su paciente', new.id using errcode = 'P0001';
  end if;
  if privacy_type is null or privacy_type not in ('privacy_policy', 'privacy_notice') then
    raise exception 'La aceptación de privacidad de la cita % no es de un aviso o una política de privacidad', new.id using errcode = 'P0001';
  end if;
  if terms_type is null or terms_type not in ('patient_terms', 'terms_and_conditions') then
    raise exception 'La aceptación de términos de la cita % no es de unos términos del paciente', new.id using errcode = 'P0001';
  end if;
  if not ((privacy_type = 'privacy_policy' and terms_type = 'patient_terms')
          or (privacy_type = 'privacy_notice' and terms_type = 'terms_and_conditions')) then
    raise exception 'Las aceptaciones legales de la cita % pertenecen a regímenes distintos', new.id using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger appointment_legal_acceptances_check
  before insert or update of privacy_legal_acceptance_id, terms_legal_acceptance_id, patient_id on appointment
  for each row execute function gst_appointment_legal_acceptances_check();

-- ---------------------------------------------------------------------------------------------------------- 3
-- gst_appointment_guard de 0013 más la inmutabilidad de las dos referencias: se fijan en el INSERT y ningún UPDATE
-- las pone, cambia ni quita (tampoco de NULL a un valor). El resto es idéntico a 0013.
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
  if new.privacy_legal_acceptance_id is distinct from old.privacy_legal_acceptance_id
     or new.terms_legal_acceptance_id is distinct from old.terms_legal_acceptance_id then
    raise exception 'Las aceptaciones legales de la cita % no pueden cambiar después de reservar', old.id using errcode = 'P0001';
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

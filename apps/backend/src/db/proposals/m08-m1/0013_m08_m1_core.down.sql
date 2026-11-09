-- ============================================================================================================
-- Reversión de 0013 (M-1 parte A). Devuelve el esquema EXACTO de 0000–0012 (funciones de 0001 incluidas).
-- Transaccional. Recupera el enum recreando el tipo sin 'rescheduled' (PostgreSQL no elimina valores de un enum).
-- Se niega a ejecutarse si existe alguna cita o fila de historial en 'rescheduled' (se perderían datos) o si 0014
-- sigue aplicada. Se pierden agenda_block_ends_at y los dos parámetros nuevos de la política.
-- ============================================================================================================

do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                  where t.typname = 'appointment_status_enum' and e.enumlabel = 'rescheduled') then
    raise exception '0013 no está aplicada' using errcode = 'P0001';
  end if;
  if exists (select 1 from information_schema.columns
              where table_name = 'appointment'
                and column_name in ('legal_acceptance_id', 'privacy_legal_acceptance_id', 'terms_legal_acceptance_id')) then
    raise exception 'Revierta primero 0014 (referencias legales de la cita)' using errcode = 'P0001';
  end if;
  if exists (select 1 from appointment where status = 'rescheduled')
     or exists (select 1 from appointment_status_history where status = 'rescheduled') then
    raise exception 'No se puede revertir: hay citas o historial en rescheduled; corregir hacia adelante' using errcode = 'P0001';
  end if;
end $$;

-- 5
drop trigger consultation_price_configuration_no_truncate on consultation_price_configuration;
drop trigger consultation_price_configuration_versioned on consultation_price_configuration;
drop trigger cancellation_policy_no_truncate on cancellation_policy;
drop trigger cancellation_policy_versioned on cancellation_policy;
drop function gst_versioned_config_no_truncate();
drop function gst_versioned_config_guard();

-- 4
alter table cancellation_policy drop constraint cancellation_policy_windows_chk;
alter table cancellation_policy drop column reconnect_grace_minutes, drop column max_protected_wait_minutes;

-- 2
alter table appointment drop constraint appointment_agenda_block_ends_at_chk;
alter table appointment drop column agenda_block_ends_at;

-- 1a (recreación del tipo sin 'rescheduled')
drop trigger appointment_lock_entries on appointment;
create type appointment_status_enum_v0 as enum (
  'pending_payment', 'expired', 'confirmed', 'completed', 'canceled',
  'no_show_patient', 'no_show_doctor', 'no_show_both'
);
alter table appointment alter column status type appointment_status_enum_v0 using status::text::appointment_status_enum_v0;
alter table appointment_status_history alter column status type appointment_status_enum_v0 using status::text::appointment_status_enum_v0;
drop type appointment_status_enum;
alter type appointment_status_enum_v0 rename to appointment_status_enum;

-- 1c (texto original de 0001)
create or replace function gst_appointment_lock_entries() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status
     and new.status in ('completed', 'canceled', 'no_show_patient', 'no_show_doctor', 'no_show_both') then
    update medical_record_entry
       set locked_at = now()
     where appointment_id = new.id
       and locked_at is null;
  end if;
  return null;
end;
$$;

create trigger appointment_lock_entries
  after update of status on appointment
  for each row execute function gst_appointment_lock_entries();

-- 1b (texto original de 0001)
create or replace function gst_appointment_guard() returns trigger
language plpgsql as $$
begin
  if new.cancellation_policy_id is distinct from old.cancellation_policy_id then
    raise exception 'La política aplicada a la cita % no puede cambiar después de reservar', old.id
      using errcode = 'P0001';
  end if;
  if new.status is distinct from old.status then
    if old.status = 'pending_payment' and new.status not in ('confirmed', 'expired') then
      raise exception 'Una cita en pending_payment solo pasa a confirmed o a expired, no a %', new.status
        using errcode = 'P0001';
    end if;
    if new.status = 'expired' and old.status <> 'pending_payment' then
      raise exception 'Solo una cita en pending_payment puede pasar a expired'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

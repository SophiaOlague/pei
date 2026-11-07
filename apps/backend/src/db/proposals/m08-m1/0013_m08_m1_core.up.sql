-- ============================================================================================================
-- M-1 (M08 Citas) · Parte A, OBLIGATORIA · PROPUESTA, NO APLICADA
-- ------------------------------------------------------------------------------------------------------------
-- No está en src/db/migrations ni en el journal de Drizzle: no la aplica `db:migrate`. Aplicarla en cualquier entorno
-- requiere autorización expresa (docs/arquitectura/M08-diseno.md, A.14).
--
-- Es TOTALMENTE TRANSACCIONAL: el enum se recrea (no se usa ALTER TYPE … ADD VALUE, que no permite usar el valor nuevo
-- en la misma transacción ni revertirlo). Ejecútese dentro de una sola transacción; si algo falla, no queda nada.
--
-- Contenido:
--   1a  appointment_status_enum + 'rescheduled' (C-25)                      recreación del tipo
--   1b  gst_appointment_guard: matriz completa de transiciones (H-1) e inmutabilidad de las copias de la reserva
--   1c  gst_appointment_lock_entries: incluye 'rescheduled'
--   2   appointment.agenda_block_ends_at (DA-3, AP-23), con relleno y CHECK; sin NOT NULL (expandir y contraer)
--   4   cancellation_policy.max_protected_wait_minutes y reconnect_grace_minutes (C-26, AP-22), con CHECK de orden
--   5   versiones de precio y política: solo se cierran una vez; sin DELETE, TRUNCATE ni otros UPDATE (RN-021)
-- Excluido: 3 (legal_acceptance_id, depende de M02: 0014) y 6 (EXCLUDE de citas con btree_gist, opcional).
-- 5c (índice «una versión abierta») se retiró: 0001 ya tiene EXCLUDE … no_overlap en ambas tablas.
-- ============================================================================================================

do $$
begin
  if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
              where t.typname = 'appointment_status_enum' and e.enumlabel = 'rescheduled') then
    raise exception 'M-1 ya está aplicada: appointment_status_enum ya contiene rescheduled' using errcode = 'P0001';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------- 1a
-- appointment_lock_entries es AFTER UPDATE OF status: PostgreSQL no permite cambiar el tipo de una columna que
-- aparece en la definición de un trigger, así que se quita y se vuelve a crear en 1c.
drop trigger appointment_lock_entries on appointment;

create type appointment_status_enum_m1 as enum (
  'pending_payment', 'expired', 'confirmed', 'completed', 'canceled',
  'no_show_patient', 'no_show_doctor', 'no_show_both', 'rescheduled'
);
-- Reescritura de tabla: no dispara triggers de fila (appointment_guard ni el append-only del historial).
alter table appointment alter column status type appointment_status_enum_m1 using status::text::appointment_status_enum_m1;
alter table appointment_status_history alter column status type appointment_status_enum_m1 using status::text::appointment_status_enum_m1;
drop type appointment_status_enum;
alter type appointment_status_enum_m1 rename to appointment_status_enum;

-- ---------------------------------------------------------------------------------------------------------- 2
alter table appointment add column agenda_block_ends_at timestamptz;
-- Relleno con la duración vigente del médico (la mejor aproximación disponible para filas anteriores a M-1).
update appointment a
   set agenda_block_ends_at = a.scheduled_at + make_interval(mins => d.appointment_duration_minutes)
  from doctor_profile d
 where d.id = a.doctor_id and a.agenda_block_ends_at is null;
alter table appointment add constraint appointment_agenda_block_ends_at_chk
  check (agenda_block_ends_at is null or agenda_block_ends_at > scheduled_at);
-- NOT NULL se agrega en un paso posterior (M-1c), cuando el código de M08 ya escriba la columna.

-- ---------------------------------------------------------------------------------------------------------- 1b
-- Matriz de transiciones (docs/arquitectura/M08-diseno.md, A.14.2). Las copias de la reserva no cambian.
-- agenda_block_ends_at y legal_acceptance_id se leen con to_jsonb para que la misma función sirva antes y después de
-- 0014 (la columna legal_acceptance_id puede no existir).
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

-- ---------------------------------------------------------------------------------------------------------- 1c
create or replace function gst_appointment_lock_entries() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status
     and new.status in ('completed', 'canceled', 'no_show_patient', 'no_show_doctor', 'no_show_both', 'rescheduled') then
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

-- ---------------------------------------------------------------------------------------------------------- 4
-- Con DEFAULT para que el código actual (que no escribe estas columnas) siga funcionando; los DEFAULT se retiran en
-- M-1c, cuando el caso de uso de la política las reciba.
alter table cancellation_policy
  add column max_protected_wait_minutes integer not null default 60,
  add column reconnect_grace_minutes integer not null default 5;
alter table cancellation_policy add constraint cancellation_policy_windows_chk check (
  refund_deadline_hours > 0
  and max_reschedules >= 0
  and patient_tolerance_minutes > 0
  and patient_tolerance_minutes <= doctor_wait_minutes
  and doctor_wait_minutes <= max_protected_wait_minutes
  and reconnect_grace_minutes > 0
  and reconnect_grace_minutes < patient_tolerance_minutes
);

-- ---------------------------------------------------------------------------------------------------------- 5
-- Una versión publicada no se modifica: solo se cierra una vez (effective_until de NULL a un valor).
create or replace function gst_versioned_config_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'La tabla % es versionada: no admite DELETE', tg_table_name using errcode = 'P0001';
  end if;
  if old.effective_until is not null or new.effective_until is null then
    raise exception 'Una versión de % solo puede cerrarse una vez', tg_table_name using errcode = 'P0001';
  end if;
  if (to_jsonb(new) - 'effective_until') is distinct from (to_jsonb(old) - 'effective_until') then
    raise exception 'Una versión de % no se modifica: publique una nueva', tg_table_name using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function gst_versioned_config_no_truncate() returns trigger
language plpgsql as $$
begin
  raise exception 'La tabla % es versionada: no admite TRUNCATE', tg_table_name using errcode = 'P0001';
end;
$$;

create trigger cancellation_policy_versioned before update or delete on cancellation_policy
  for each row execute function gst_versioned_config_guard();
create trigger cancellation_policy_no_truncate before truncate on cancellation_policy
  for each statement execute function gst_versioned_config_no_truncate();
create trigger consultation_price_configuration_versioned before update or delete on consultation_price_configuration
  for each row execute function gst_versioned_config_guard();
create trigger consultation_price_configuration_no_truncate before truncate on consultation_price_configuration
  for each statement execute function gst_versioned_config_no_truncate();

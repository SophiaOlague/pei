-- Validación de integridad posterior a M-1 (solo lectura). Cada fila debe devolver ok = true.
select 'enum con rescheduled' as check, exists (
  select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'appointment_status_enum' and e.enumlabel = 'rescheduled') as ok
union all
select 'un solo tipo de estado de cita', (select count(*) = 1 from pg_type where typname like 'appointment_status_enum%')
union all
select 'appointment.status usa el enum', (select udt_name = 'appointment_status_enum' from information_schema.columns where table_name = 'appointment' and column_name = 'status')
union all
select 'historial.status usa el enum', (select udt_name = 'appointment_status_enum' from information_schema.columns where table_name = 'appointment_status_history' and column_name = 'status')
union all
select 'triggers de cita presentes', (select count(*) = 2 from pg_trigger where tgrelid = 'appointment'::regclass and tgname in ('appointment_guard', 'appointment_lock_entries') and not tgisinternal)
union all
select 'historial sigue append-only', exists (select 1 from pg_trigger where tgname = 'appointment_status_history_append_only')
union all
select 'versiones protegidas', (select count(*) = 4 from pg_trigger where tgname in ('cancellation_policy_versioned', 'cancellation_policy_no_truncate', 'consultation_price_configuration_versioned', 'consultation_price_configuration_no_truncate'))
union all
select 'no_overlap de 0001 intacto', (select count(*) = 2 from pg_constraint where conname in ('cancellation_policy_no_overlap', 'consultation_price_configuration_no_overlap'))
union all
select 'bloques válidos', not exists (select 1 from appointment where agenda_block_ends_at is not null and agenda_block_ends_at <= scheduled_at)
union all
select 'citas sin bloque (relleno)', not exists (select 1 from appointment where agenda_block_ends_at is null)
union all
select 'políticas coherentes', not exists (select 1 from cancellation_policy where not (patient_tolerance_minutes <= doctor_wait_minutes and doctor_wait_minutes <= max_protected_wait_minutes and reconnect_grace_minutes < patient_tolerance_minutes));

-- ============================================================================================================
-- Videoconsulta · REVERSIÓN de 0019 · PROPUESTA, NO APLICADA EN NINGUNA BASE
-- ------------------------------------------------------------------------------------------------------------
-- Retira los triggers y las columnas de 0019 y vuelve a exigir meeting.room_id. Solo procede si no hay videoconsultas
-- (meeting y meeting_session_event vacías) ni reembolsos por inasistencia: no borra datos.
-- Los valores de enum ('left_voluntarily', 'no_show_doctor', 'no_show_both') NO se retiran: PostgreSQL no lo permite;
-- quedan sin uso. Retirarlos exigiría recrear los tipos con una migración aprobada aparte.
-- ============================================================================================================

do $$
begin
  if to_regclass('public.meeting') is null
     or not exists (select 1 from information_schema.columns where table_name = 'meeting' and column_name = 'patient_last_seen_at') then
    raise exception 'La reversión de 0019 requiere 0019 aplicada' using errcode = 'P0001';
  end if;
  if exists (select 1 from meeting) or exists (select 1 from meeting_session_event) then
    raise exception 'La reversión de 0019 no borra videoconsultas: meeting o meeting_session_event tienen filas' using errcode = 'P0001';
  end if;
  if exists (select 1 from refund where reason::text in ('no_show_doctor', 'no_show_both')) then
    raise exception 'La reversión de 0019 no procede: hay reembolsos por inasistencia' using errcode = 'P0001';
  end if;
end $$;

drop trigger meeting_session_event_no_truncate on meeting_session_event;
drop trigger meeting_session_event_append_only on meeting_session_event;

alter table meeting drop column doctor_provider_participant_id;
alter table meeting drop column patient_provider_participant_id;
alter table meeting drop column doctor_last_seen_at;
alter table meeting drop column patient_last_seen_at;
alter table meeting alter column room_id set not null;

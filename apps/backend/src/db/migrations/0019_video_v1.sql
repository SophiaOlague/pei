-- ============================================================================================================
-- Videoconsulta · primera entrega (RF-18 a RF-22): presencia, salida voluntaria, revocación y reembolso por inasistencia
-- ------------------------------------------------------------------------------------------------------------
-- Fuente: docs/arquitectura/Video-diseno.md §8 (decisiones 4, 5, 7, 8 y 9, aprobadas el 2026-11-20).
--
-- Solo cambios aditivos. No crea tablas, no lee ni escribe datos:
-- - meeting_session_event_type_enum + 'left_voluntarily' (RN-026: salida voluntaria; `left` es la involuntaria).
-- - refund_reason_enum + 'no_show_doctor' y 'no_show_both' (RN-025, RN-030: reembolso total por inasistencia).
-- - meeting.room_id admite nulos: la sala de espera es de PEI y la fila nace antes de la sala del proveedor. La
--   unicidad (meeting_room_id_unique) se conserva.
-- - meeting.patient_last_seen_at, doctor_last_seen_at: último latido de presencia (decisión 5).
-- - meeting.patient_provider_participant_id, doctor_provider_participant_id: revocar el acceso al finalizar (decisión 7).
-- - meeting_session_event de solo inserción (RN-031): reutiliza gst_append_only (0001) y gst_no_truncate (0017).
--
-- Exige pei.migration_authorized = '0019' en la sesión (R-1): un comando genérico no puede aplicarla.
--
-- Reversión: src/db/proposals/video-v1/0019_video_v1.down.sql. PostgreSQL no permite retirar un valor de un enum: los
-- tres valores nuevos se quedan; son inocuos mientras ninguna fila los use.
-- ============================================================================================================

do $$
begin
  -- R-1: solo un ejecutor controlado autoriza 0019, en su sesión verificada y después de comprobar la huella completa
  -- del destino (scripts/migration-authorization.ts). Ni drizzle-kit ni otra herramienta definen esta variable.
  if coalesce(current_setting('pei.migration_authorized', true), '') <> '0019' then
    raise exception '0019 requiere autorización explícita de un ejecutor controlado (pei.migration_authorized). No se modificó nada'
      using errcode = 'P0001';
  end if;
  -- Un valor persistente (ALTER ROLE/DATABASE … SET) autorizaría cualquier sesión: no se admite.
  if exists (select 1 from pg_db_role_setting where array_to_string(setconfig, ',') like '%pei.migration_authorized%') then
    raise exception '0019 no admite una autorización persistente (ALTER ROLE/DATABASE … SET pei.migration_authorized)'
      using errcode = 'P0001';
  end if;
  if not exists (select 1 from pg_enum e where e.enumtypid = 'public.payment_provider_enum'::regtype and e.enumlabel = 'stripe') then
    raise exception '0019 requiere 0018 (payment_provider_enum con stripe)' using errcode = 'P0001';
  end if;
  if to_regprocedure('public.gst_append_only()') is null or to_regprocedure('public.gst_no_truncate()') is null then
    raise exception '0019 requiere gst_append_only (0001) y gst_no_truncate (0017)' using errcode = 'P0001';
  end if;
  if exists (select 1 from pg_enum e where e.enumtypid = 'public.meeting_session_event_type_enum'::regtype and e.enumlabel = 'left_voluntarily') then
    raise exception '0019 ya está aplicada (meeting_session_event_type_enum contiene left_voluntarily)' using errcode = 'P0001';
  end if;
end $$;

alter type meeting_session_event_type_enum add value 'left_voluntarily';
alter type refund_reason_enum add value 'no_show_doctor';
alter type refund_reason_enum add value 'no_show_both';

alter table meeting alter column room_id drop not null;
alter table meeting add column patient_last_seen_at timestamp with time zone;
alter table meeting add column doctor_last_seen_at timestamp with time zone;
alter table meeting add column patient_provider_participant_id varchar;
alter table meeting add column doctor_provider_participant_id varchar;

create trigger meeting_session_event_append_only
  before update or delete on meeting_session_event
  for each row execute function gst_append_only();
create trigger meeting_session_event_no_truncate
  before truncate on meeting_session_event
  for each statement execute function gst_no_truncate();

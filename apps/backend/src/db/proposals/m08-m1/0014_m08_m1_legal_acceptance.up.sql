-- ============================================================================================================
-- M-1 (M08 Citas) · Parte B, DEPENDIENTE DE M02 (C-32, AP-19) · PROPUESTA, NO APLICADA
-- ------------------------------------------------------------------------------------------------------------
-- Solo se aplica si se autoriza el cambio aditivo de M02 (lector de la aceptación legal, A.14.6). Requiere 0013.
-- La inmutabilidad la cubre ya gst_appointment_guard de 0013 (lee la columna con to_jsonb): no hace falta otra función.
-- ============================================================================================================

do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                  where t.typname = 'appointment_status_enum' and e.enumlabel = 'rescheduled') then
    raise exception '0014 requiere 0013 (M-1 parte A)' using errcode = 'P0001';
  end if;
end $$;

-- Nula para las citas anteriores; el código de M08 la escribirá en cada reserva nueva (se exige en la aplicación).
alter table appointment add column legal_acceptance_id uuid
  references user_legal_acceptance (id) on delete no action on update no action;
create index appointment_legal_acceptance_idx on appointment (legal_acceptance_id);

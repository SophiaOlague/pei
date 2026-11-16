-- ============================================================================================================
-- M-1c (M08 Citas) · agenda_block_ends_at NOT NULL (DA-3, AP-23) · PROPUESTA, NO APLICADA
-- ------------------------------------------------------------------------------------------------------------
-- Contrae lo expandido en 0013 (#2): desde el commit 3f4b612 toda cita nueva guarda agenda_block_ends_at. Esta
-- migración NO rellena nada: el fin original de una cita con el valor nulo no se puede reconstruir (la duración del
-- médico pudo cambiar). Si queda alguna, se detiene y exige una decisión explícita por cada fila. Requiere 0013 y
-- 0014 (orden del journal).
-- Transaccional. No retira los DEFAULT de max_protected_wait_minutes / reconnect_grace_minutes (paso aparte).
-- ============================================================================================================

do $$
declare
  missing integer;
begin
  if not exists (select 1 from information_schema.columns
                  where table_name = 'appointment' and column_name = 'agenda_block_ends_at') then
    raise exception '0015 requiere 0013 (agenda_block_ends_at)' using errcode = 'P0001';
  end if;
  if (select count(*) from information_schema.columns
       where table_name = 'appointment' and column_name in ('privacy_legal_acceptance_id', 'terms_legal_acceptance_id')) <> 2 then
    raise exception '0015 requiere 0014 (referencias legales)' using errcode = 'P0001';
  end if;
  if exists (select 1 from information_schema.columns
              where table_name = 'appointment' and column_name = 'agenda_block_ends_at' and is_nullable = 'NO') then
    raise exception '0015 ya está aplicada' using errcode = 'P0001';
  end if;
  select count(*) into missing from appointment where agenda_block_ends_at is null;
  if missing > 0 then
    raise exception '0015: % citas sin agenda_block_ends_at; requieren una decisión explícita antes de aplicar', missing
      using errcode = 'P0001';
  end if;
end $$;

alter table appointment alter column agenda_block_ends_at set not null;

-- El CHECK de 0013 admitía el nulo; con NOT NULL basta la condición de orden.
alter table appointment drop constraint appointment_agenda_block_ends_at_chk;
alter table appointment add constraint appointment_agenda_block_ends_at_chk check (agenda_block_ends_at > scheduled_at);

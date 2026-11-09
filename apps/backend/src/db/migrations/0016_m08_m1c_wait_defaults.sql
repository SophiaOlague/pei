-- ============================================================================================================
-- M-1c (M08 Citas) · retira los DEFAULT de L y G (AP-22, C-26) · PROPUESTA, NO APLICADA
-- ------------------------------------------------------------------------------------------------------------
-- 0013 (#4) añadió cancellation_policy.max_protected_wait_minutes (DEFAULT 60) y reconnect_grace_minutes (DEFAULT 5)
-- para no romper las versiones existentes (expandir y contraer). Desde 3f4b612 el código escribe ambos en cada
-- versión nueva, así que el DEFAULT ya no se necesita: retirarlo obliga a que toda inserción los indique. No toca
-- filas ni el CHECK cancellation_policy_windows_chk. Requiere 0015 (orden del journal). Transaccional.
-- ============================================================================================================

do $$
begin
  if (select count(*) from information_schema.columns
       where table_name = 'cancellation_policy'
         and column_name in ('max_protected_wait_minutes', 'reconnect_grace_minutes')) <> 2 then
    raise exception '0016 requiere 0013 (L y G en cancellation_policy)' using errcode = 'P0001';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_name = 'appointment' and column_name = 'agenda_block_ends_at' and is_nullable = 'NO') then
    raise exception '0016 requiere 0015 (agenda_block_ends_at NOT NULL)' using errcode = 'P0001';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_name = 'cancellation_policy'
                    and column_name in ('max_protected_wait_minutes', 'reconnect_grace_minutes')
                    and column_default is not null) then
    raise exception '0016 ya está aplicada' using errcode = 'P0001';
  end if;
end $$;

alter table cancellation_policy alter column max_protected_wait_minutes drop default;
alter table cancellation_policy alter column reconnect_grace_minutes drop default;

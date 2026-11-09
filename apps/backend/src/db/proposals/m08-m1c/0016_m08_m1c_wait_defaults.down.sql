-- M-1c · reversión de 0016: restaura los DEFAULT literales de 0013 (60 y 5). No toca filas.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_name = 'cancellation_policy'
                and column_name in ('max_protected_wait_minutes', 'reconnect_grace_minutes')
                and column_default is not null) then
    raise exception '0016 no está aplicada' using errcode = 'P0001';
  end if;
end $$;

alter table cancellation_policy alter column max_protected_wait_minutes set default 60;
alter table cancellation_policy alter column reconnect_grace_minutes set default 5;

-- M-1c · reversión de 0015: vuelve a admitir nulos y restaura el CHECK literal de 0013. No toca datos.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_name = 'appointment' and column_name = 'agenda_block_ends_at' and is_nullable = 'NO') then
    raise exception '0015 no está aplicada' using errcode = 'P0001';
  end if;
end $$;

alter table appointment drop constraint appointment_agenda_block_ends_at_chk;
alter table appointment add constraint appointment_agenda_block_ends_at_chk
  check (agenda_block_ends_at is null or agenda_block_ends_at > scheduled_at);
alter table appointment alter column agenda_block_ends_at drop not null;

-- Reversión de 0014 (M-1 parte B). Se pierden las referencias guardadas: exportarlas antes si hubiera citas reales.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'appointment' and column_name = 'legal_acceptance_id') then
    raise exception '0014 no está aplicada' using errcode = 'P0001';
  end if;
end $$;

drop index appointment_legal_acceptance_idx;
alter table appointment drop column legal_acceptance_id;

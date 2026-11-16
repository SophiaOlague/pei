-- M-1c · consulta de SOLO LECTURA para decidir si 0015 puede aplicarse (ejecutar en una transacción READ ONLY).
-- Devuelve las citas sin agenda_block_ends_at con lo necesario para decidir cada una; no modifica nada.
begin transaction read only;
select a.id, a.status::text as status, a.scheduled_at, a.created_at, a.doctor_id,
       d.appointment_duration_minutes as current_doctor_duration_minutes
  from appointment a join doctor_profile d on d.id = a.doctor_id
 where a.agenda_block_ends_at is null
 order by a.created_at;
rollback;

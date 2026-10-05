-- ============================================================
-- GESTINOVO / PEI — TRIGGERS Y CONSTRAINTS QUE DRIZZLE NO DECLARA
-- PostgreSQL / Neon. Se aplica después de la migración generada
-- a partir de schema.ts.
--
-- Cómo agregarla al proyecto:
--   npx drizzle-kit generate --custom --name=triggers
--   y pegar este contenido en el archivo .sql que se crea.
-- Usar "generate" + "migrate"; "drizzle-kit push" no conoce estos
-- objetos y puede intentar eliminarlos.
--
-- Cada bloque cita la regla del Documento Maestro V2.2 que aplica.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Funciones comunes
-- ------------------------------------------------------------

-- Bloquea UPDATE y DELETE: la tabla solo admite INSERT.
create or replace function gst_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'La tabla % es de solo inserción: no admite %', tg_table_name, tg_op
    using errcode = 'P0001';
end;
$$;

-- ------------------------------------------------------------
-- 1. Auditoría e historiales de solo inserción
--    RN-119 (audit_log append-only), RN-105 (delivery_failed se
--    conserva en el historial), RN-006 y RNF-12 (trazabilidad legal).
-- ------------------------------------------------------------

create trigger audit_log_append_only
  before update or delete on audit_log
  for each row execute function gst_append_only();

create trigger appointment_status_history_append_only
  before update or delete on appointment_status_history
  for each row execute function gst_append_only();

create trigger order_status_history_append_only
  before update or delete on order_status_history
  for each row execute function gst_append_only();

create trigger user_legal_acceptance_append_only
  before update or delete on user_legal_acceptance
  for each row execute function gst_append_only();

-- Una versión legal publicada no cambia: se publica otra versión.
create trigger legal_document_append_only
  before update or delete on legal_document
  for each row execute function gst_append_only();

-- ------------------------------------------------------------
-- 2. Expediente clínico
--    RN-040 (inmutable al cierre), RN-041 (autoría), RNF-02, RNF-03.
-- ------------------------------------------------------------

-- Una entrada cerrada (locked_at no nulo) no se modifica ni se elimina.
create or replace function gst_medical_record_entry_immutable() returns trigger
language plpgsql as $$
begin
  if old.locked_at is not null then
    raise exception 'La entrada clínica % está cerrada y es inmutable', old.id
      using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger medical_record_entry_immutable
  before update or delete on medical_record_entry
  for each row execute function gst_medical_record_entry_immutable();

-- La entrada ligada a una cita debe corresponder al paciente y al médico de esa cita.
create or replace function gst_medical_record_entry_authorship() returns trigger
language plpgsql as $$
declare
  v_appt_patient uuid;
  v_appt_doctor uuid;
  v_record_patient uuid;
begin
  if new.appointment_id is null then
    return new;
  end if;
  select patient_id, doctor_id into v_appt_patient, v_appt_doctor
    from appointment where id = new.appointment_id;
  select patient_id into v_record_patient
    from medical_record where id = new.medical_record_id;
  if v_appt_patient is distinct from v_record_patient then
    raise exception 'La cita % no pertenece al paciente de este expediente', new.appointment_id
      using errcode = 'P0001';
  end if;
  if v_appt_doctor is distinct from new.authored_by then
    raise exception 'El autor de la entrada no es el médico de la cita %', new.appointment_id
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger medical_record_entry_authorship
  before insert or update of appointment_id, authored_by, medical_record_id on medical_record_entry
  for each row execute function gst_medical_record_entry_authorship();

-- ------------------------------------------------------------
-- 3. Citas
--    RN-012 (pending_payment pasa a expired, nunca a canceled),
--    RN-021 (aplica la política vigente al reservar),
--    RF-27 (al cerrar la cita se fija locked_at).
-- ------------------------------------------------------------

create or replace function gst_appointment_guard() returns trigger
language plpgsql as $$
begin
  if new.cancellation_policy_id is distinct from old.cancellation_policy_id then
    raise exception 'La política aplicada a la cita % no puede cambiar después de reservar', old.id
      using errcode = 'P0001';
  end if;
  if new.status is distinct from old.status then
    if old.status = 'pending_payment' and new.status not in ('confirmed', 'expired') then
      raise exception 'Una cita en pending_payment solo pasa a confirmed o a expired, no a %', new.status
        using errcode = 'P0001';
    end if;
    if new.status = 'expired' and old.status <> 'pending_payment' then
      raise exception 'Solo una cita en pending_payment puede pasar a expired'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger appointment_guard
  before update on appointment
  for each row execute function gst_appointment_guard();

-- Al cerrar la cita se cierran sus entradas clínicas.
create or replace function gst_appointment_lock_entries() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status
     and new.status in ('completed', 'canceled', 'no_show_patient', 'no_show_doctor', 'no_show_both') then
    update medical_record_entry
       set locked_at = now()
     where appointment_id = new.id
       and locked_at is null;
  end if;
  return null;
end;
$$;

create trigger appointment_lock_entries
  after update of status on appointment
  for each row execute function gst_appointment_lock_entries();

-- ------------------------------------------------------------
-- 4. Recetas
--    RF-30 (la receta no queda activa hasta que la firma concluye),
--    RN-083 y RN-092 (lo surtido no supera lo prescrito).
-- ------------------------------------------------------------

-- Una receta solo pasa a active si su firma está en signed.
create or replace function gst_prescription_requires_signature() returns trigger
language plpgsql as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    if not exists (
      select 1 from prescription_signature
       where prescription_id = new.id and status = 'signed'
    ) then
      raise exception 'La receta % no puede activarse sin una firma en estado signed', new.id
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger prescription_requires_signature
  before insert or update of status on prescription
  for each row execute function gst_prescription_requires_signature();

-- La suma de lo surtido (reserved + dispensed) no supera quantity_prescribed.
-- Bloquea el renglón de receta para que dos pedidos simultáneos no lo excedan.
create or replace function gst_fulfillment_within_prescription() returns trigger
language plpgsql as $$
declare
  v_prescribed integer;
  v_used integer;
  v_item_prescription uuid;
begin
  select prescription_item_id into v_item_prescription
    from medication_order_item where id = new.medication_order_item_id;
  if v_item_prescription is distinct from new.prescription_item_id then
    raise exception 'El renglón del pedido no corresponde al renglón de receta %', new.prescription_item_id
      using errcode = 'P0001';
  end if;

  select quantity_prescribed into v_prescribed
    from prescription_item where id = new.prescription_item_id
    for update;

  select coalesce(sum(quantity), 0) into v_used
    from prescription_item_fulfillment
   where prescription_item_id = new.prescription_item_id
     and status <> 'canceled'
     and id <> new.id;

  if new.status <> 'canceled' and v_used + new.quantity > v_prescribed then
    raise exception 'Se excede la cantidad prescrita: prescrito %, ya surtido %, solicitado %',
      v_prescribed, v_used, new.quantity
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger fulfillment_within_prescription
  before insert or update of quantity, status, prescription_item_id on prescription_item_fulfillment
  for each row execute function gst_fulfillment_within_prescription();

-- ------------------------------------------------------------
-- 5. Pedidos
--    Transiciones de la sección 6.3, RN-099 (el paciente solo cancela
--    en order_received), RN-100 (el administrador cancela en cualquier
--    estado), RN-104 y RN-105 (delivery_failed), RN-106 (canje único).
-- ------------------------------------------------------------

create or replace function gst_order_status_transition() returns trigger
language plpgsql as $$
declare
  v_ok boolean := false;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'canceled' then
    if old.status = 'canceled' then
      v_ok := false;
    elsif new.cancelled_by_type = 'admin' then
      v_ok := true;
    elsif new.cancelled_by_type = 'patient' then
      v_ok := old.status = 'order_received';
    end if;
    if not v_ok then
      raise exception 'Cancelación no permitida desde % por %', old.status, coalesce(new.cancelled_by_type::text, 'actor no indicado')
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  v_ok := case
    when old.status = 'order_received'   and new.status = 'preparing' then true
    when old.status = 'preparing'        and new.status = 'ready_for_pickup' then new.delivery_method = 'pickup'
    when old.status = 'preparing'        and new.status = 'shipped' then new.delivery_method = 'home_delivery'
    when old.status = 'ready_for_pickup' and new.status in ('picked_up', 'pickup_expired') then true
    when old.status = 'pickup_expired'   and new.status = 'ready_for_pickup' then true
    when old.status = 'shipped'          and new.status in ('delivered', 'delivery_failed') then true
    else false
  end;

  if not v_ok then
    raise exception 'Transición de pedido no permitida: % → %', old.status, new.status
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger order_status_transition
  before update of status on medication_order
  for each row execute function gst_order_status_transition();

-- El comprobante de recogida es de un solo uso: una vez canjeado no cambia.
create or replace function gst_dispensation_single_redemption() returns trigger
language plpgsql as $$
begin
  if old.redeemed_at is not null and new.redeemed_at is distinct from old.redeemed_at then
    raise exception 'El comprobante del pedido % ya fue canjeado', old.order_id
      using errcode = 'P0001';
  end if;
  if old.redeemed_at is not null and new.redemption_code is distinct from old.redemption_code then
    raise exception 'El comprobante del pedido % ya fue canjeado y no puede cambiar', old.order_id
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger dispensation_single_redemption
  before update on treatment_dispensation
  for each row execute function gst_dispensation_single_redemption();

-- ------------------------------------------------------------
-- 6. Reembolsos
--    Sección 7.2: el acumulado de reembolsos no supera el pago.
-- ------------------------------------------------------------

create or replace function gst_refund_within_payment() returns trigger
language plpgsql as $$
declare
  v_payment_amount numeric(10,2);
  v_refunded numeric(10,2);
begin
  if new.status in ('failed', 'canceled') then
    return new;
  end if;

  select amount into v_payment_amount
    from payment where id = new.payment_id
    for update;

  select coalesce(sum(amount), 0) into v_refunded
    from refund
   where payment_id = new.payment_id
     and status not in ('failed', 'canceled')
     and id <> new.id;

  if v_refunded + new.amount > v_payment_amount then
    raise exception 'El reembolso excede el pago: pagado %, ya reembolsado %, solicitado %',
      v_payment_amount, v_refunded, new.amount
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger refund_within_payment
  before insert or update of amount, status, payment_id on refund
  for each row execute function gst_refund_within_payment();

-- ------------------------------------------------------------
-- 7. Liquidaciones al médico
--    RN-052, RN-053, RN-061, RN-064 a RN-066 (doctor_payout_item),
--    RN-037 (on_hold no entra a un payout ejecutable),
--    RN-079 (el payout no se modifica después de una transferencia).
-- ------------------------------------------------------------

-- Alta de un importe: solo pagos de consulta exitosos, por su importe bruto.
create or replace function gst_payout_item_insert() returns trigger
language plpgsql as $$
declare
  v_type payment_type_enum;
  v_status payment_status_enum;
  v_doctor_amount numeric(10,2);
begin
  select type, status, doctor_amount into v_type, v_status, v_doctor_amount
    from payment where id = new.payment_id;
  if v_type <> 'consultation' then
    raise exception 'Solo los pagos de consulta generan importe liquidable'
      using errcode = 'P0001';
  end if;
  if v_status <> 'succeeded' then
    raise exception 'El pago % no está en succeeded', new.payment_id
      using errcode = 'P0001';
  end if;
  if new.amount <> v_doctor_amount then
    raise exception 'El importe del médico (%) no coincide con el registrado en el pago (%)',
      new.amount, v_doctor_amount
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger payout_item_insert
  before insert on doctor_payout_item
  for each row execute function gst_payout_item_insert();

-- Cambios de un importe: datos de origen inmutables y reglas de asignación a payout.
create or replace function gst_payout_item_update() returns trigger
language plpgsql as $$
declare
  v_old_payout_status payout_status_enum;
  v_new_payout_status payout_status_enum;
  v_new_payout_doctor uuid;
  v_payment_doctor uuid;
begin
  if new.payment_id <> old.payment_id or new.amount <> old.amount or new.eligible_at <> old.eligible_at then
    raise exception 'payment_id, amount y eligible_at de un importe no se modifican'
      using errcode = 'P0001';
  end if;

  if old.payout_id is not null then
    select status into v_old_payout_status from doctor_payout where id = old.payout_id;
  end if;

  if new.payout_id is distinct from old.payout_id then
    if v_old_payout_status = 'paid' then
      raise exception 'El importe ya fue transferido en el payout % y no puede moverse', old.payout_id
        using errcode = 'P0001';
    end if;
    if new.payout_id is not null then
      if new.eligibility_status <> 'eligible' then
        raise exception 'Un importe en estado % no entra a un payout', new.eligibility_status
          using errcode = 'P0001';
      end if;
      select status, doctor_id into v_new_payout_status, v_new_payout_doctor
        from doctor_payout where id = new.payout_id for update;
      if v_new_payout_status <> 'pending' then
        raise exception 'Solo se agregan importes a un payout en pending'
          using errcode = 'P0001';
      end if;
      select doctor_id into v_payment_doctor from payment where id = new.payment_id;
      if v_payment_doctor is distinct from v_new_payout_doctor then
        raise exception 'El importe y el payout pertenecen a médicos distintos'
          using errcode = 'P0001';
      end if;
    end if;
  elsif new.payout_id is not null
        and new.eligibility_status <> 'eligible'
        and old.eligibility_status = 'eligible'
        and v_old_payout_status <> 'paid' then
    -- El importe está en un payout aún no transferido: primero hay que retirarlo.
    raise exception 'Retire el importe del payout % antes de marcarlo como %', new.payout_id, new.eligibility_status
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger payout_item_update
  before update on doctor_payout_item
  for each row execute function gst_payout_item_update();

-- La elegibilidad nunca se revierte eliminando el registro.
create trigger payout_item_no_delete
  before delete on doctor_payout_item
  for each row execute function gst_append_only();

-- El payout no se modifica ni se elimina después de una transferencia.
create or replace function gst_payout_immutable_after_transfer() returns trigger
language plpgsql as $$
begin
  if old.status = 'paid' then
    raise exception 'El payout % ya fue transferido y no puede modificarse', old.id
      using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger payout_immutable_after_transfer
  before update or delete on doctor_payout
  for each row execute function gst_payout_immutable_after_transfer();

-- gross_amount y net_amount del payout se mantienen a partir de sus importes.
create or replace function gst_payout_item_totals() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.payout_id is not null then
      update doctor_payout
         set gross_amount = gross_amount + new.amount,
             net_amount = net_amount + new.amount,
             updated_at = now()
       where id = new.payout_id;
    end if;
    return null;
  end if;

  if new.payout_id is distinct from old.payout_id then
    if old.payout_id is not null then
      update doctor_payout
         set gross_amount = gross_amount - old.amount,
             net_amount = net_amount - old.amount,
             updated_at = now()
       where id = old.payout_id;
    end if;
    if new.payout_id is not null then
      update doctor_payout
         set gross_amount = gross_amount + new.amount,
             net_amount = net_amount + new.amount,
             updated_at = now()
       where id = new.payout_id;
    end if;
  end if;
  return null;
end;
$$;

create trigger payout_item_totals
  after insert or update of payout_id on doctor_payout_item
  for each row execute function gst_payout_item_totals();

-- ------------------------------------------------------------
-- 8. Ajustes de liquidación
--    RN-070, RN-073 a RN-078: el ajuste y sus aplicaciones son de solo
--    inserción; lo aplicado no supera el ajuste; un payout transferido
--    no recibe aplicaciones.
-- ------------------------------------------------------------

create or replace function gst_adjustment_insert() returns trigger
language plpgsql as $$
declare
  v_source_doctor uuid;
begin
  select doctor_id into v_source_doctor from doctor_payout where id = new.source_payout_id;
  if v_source_doctor is distinct from new.doctor_id then
    raise exception 'El payout de origen no pertenece al médico del ajuste'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger adjustment_insert
  before insert on doctor_payout_adjustment
  for each row execute function gst_adjustment_insert();

create trigger adjustment_append_only
  before update or delete on doctor_payout_adjustment
  for each row execute function gst_append_only();

create or replace function gst_adjustment_application_insert() returns trigger
language plpgsql as $$
declare
  v_adj_amount numeric(10,2);
  v_adj_doctor uuid;
  v_applied numeric(10,2);
  v_payout_status payout_status_enum;
  v_payout_doctor uuid;
  v_payout_net numeric(10,2);
begin
  select amount, doctor_id into v_adj_amount, v_adj_doctor
    from doctor_payout_adjustment where id = new.adjustment_id
    for update;

  if sign(new.amount) <> sign(v_adj_amount) then
    raise exception 'La aplicación debe tener el mismo signo que el ajuste'
      using errcode = 'P0001';
  end if;

  select coalesce(sum(amount), 0) into v_applied
    from doctor_payout_adjustment_application
   where adjustment_id = new.adjustment_id;

  if abs(v_applied + new.amount) > abs(v_adj_amount) then
    raise exception 'Las aplicaciones (%) superan el importe del ajuste (%)',
      v_applied + new.amount, v_adj_amount
      using errcode = 'P0001';
  end if;

  select status, doctor_id, net_amount into v_payout_status, v_payout_doctor, v_payout_net
    from doctor_payout where id = new.applied_payout_id
    for update;

  if v_payout_status = 'paid' then
    raise exception 'El payout % ya fue transferido y no admite ajustes', new.applied_payout_id
      using errcode = 'P0001';
  end if;
  if v_payout_doctor is distinct from v_adj_doctor then
    raise exception 'El payout donde se aplica no pertenece al médico del ajuste'
      using errcode = 'P0001';
  end if;
  if v_payout_net + new.amount < 0 then
    raise exception 'El payout no alcanza para compensar %: neto disponible %', new.amount, v_payout_net
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger adjustment_application_insert
  before insert on doctor_payout_adjustment_application
  for each row execute function gst_adjustment_application_insert();

-- adjustment_amount y net_amount del payout se mantienen a partir de las aplicaciones.
create or replace function gst_adjustment_application_totals() returns trigger
language plpgsql as $$
begin
  update doctor_payout
     set adjustment_amount = adjustment_amount + new.amount,
         net_amount = net_amount + new.amount,
         updated_at = now()
   where id = new.applied_payout_id;
  return null;
end;
$$;

create trigger adjustment_application_totals
  after insert on doctor_payout_adjustment_application
  for each row execute function gst_adjustment_application_totals();

create trigger adjustment_application_append_only
  before update or delete on doctor_payout_adjustment_application
  for each row execute function gst_append_only();

-- ------------------------------------------------------------
-- 9. Configuraciones versionadas sin solapamiento
--    Sección 7.2 y RNF-17: dentro de una misma familia, dos versiones
--    no pueden estar vigentes al mismo tiempo. effective_until nulo
--    significa vigencia abierta.
-- ------------------------------------------------------------

alter table consultation_commission_configuration
  add constraint commission_configuration_no_overlap
  exclude using gist (tstzrange(effective_from, effective_until) with &&);

alter table cancellation_policy
  add constraint cancellation_policy_no_overlap
  exclude using gist (tstzrange(effective_from, effective_until) with &&);

alter table pickup_configuration
  add constraint pickup_configuration_no_overlap
  exclude using gist (tstzrange(effective_from, effective_until) with &&);

alter table consultation_price_configuration
  add constraint consultation_price_configuration_no_overlap
  exclude using gist (tstzrange(effective_from, effective_until) with &&);

-- ------------------------------------------------------------
-- 10. Permisos (ajustar al rol real de la aplicación)
--     RN-119: además del trigger, conviene negar UPDATE/DELETE por
--     permisos al rol con el que se conecta la aplicación.
-- ------------------------------------------------------------
-- revoke update, delete, truncate on audit_log from <rol_de_la_aplicacion>;

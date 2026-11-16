-- ============================================================================================================
-- Payments F1 · esquema de pagos con proveedor genérico (Mercado Pago), ledger del médico y liquidaciones
-- PROPUESTA, NO APLICADA EN NINGUNA BASE.
-- ------------------------------------------------------------------------------------------------------------
-- Fuente: docs/arquitectura/Payments-decisiones.md (PAY-01 a PAY-25, C-1 a C-4, I-1 a I-10).
--
-- SOLO EL CAMINO DIRECTO (§3.7, compuerta 0.e). La migración aborta si alguna de las diez tablas de pagos tiene
-- filas. No borra, transforma ni hace backfill de datos. Validado con el preflight 0.b solo en C2. Para cualquier otro
-- destino se necesita su propio preflight.
--
-- Como las tablas están vacías, las tablas financieras se recrean con su forma final. Las funciones de 0001 que
-- conservan nombre se redefinen con CREATE OR REPLACE. 0001 no se edita. Requiere 0013 (gst_versioned_config_guard)
-- y 0016. Es transaccional: el migrador la ejecuta en una sola transacción.
--
-- Exige pei.migration_authorized = '0017' en la sesión (R-1): un comando genérico no puede aplicarla.
-- ============================================================================================================

-- ------------------------------------------------------------------------------------------------------------
-- 0. Precondiciones y camino directo
-- ------------------------------------------------------------------------------------------------------------
do $$
declare
  v_table text;
  v_rows bigint;
  v_nonempty text := '';
begin
  -- R-1: solo un ejecutor controlado autoriza 0017, en su sesión verificada y después de comprobar la huella completa
  -- del destino (scripts/migration-authorization.ts). Ni drizzle-kit ni otra herramienta definen esta variable.
  if coalesce(current_setting('pei.migration_authorized', true), '') <> '0017' then
    raise exception '0017 requiere autorización explícita de un ejecutor controlado (pei.migration_authorized). No se modificó nada'
      using errcode = 'P0001';
  end if;
  -- Un valor persistente (ALTER ROLE/DATABASE … SET) autorizaría cualquier sesión: no se admite.
  if exists (select 1 from pg_db_role_setting where array_to_string(setconfig, ',') like '%pei.migration_authorized%') then
    raise exception '0017 no admite una autorización persistente (ALTER ROLE/DATABASE … SET pei.migration_authorized)'
      using errcode = 'P0001';
  end if;
  if to_regclass('public.doctor_ledger_entry') is not null then
    raise exception '0017 ya está aplicada (existe doctor_ledger_entry)' using errcode = 'P0001';
  end if;
  if to_regprocedure('public.gst_versioned_config_guard()') is null then
    raise exception '0017 requiere 0013 (gst_versioned_config_guard)' using errcode = 'P0001';
  end if;
  if exists (select 1 from information_schema.columns
              where table_name = 'cancellation_policy'
                and column_name in ('max_protected_wait_minutes', 'reconnect_grace_minutes')
                and column_default is not null) then
    raise exception '0017 requiere 0016 (sin DEFAULT en L y G)' using errcode = 'P0001';
  end if;
  foreach v_table in array array['payment', 'refund', 'stripe_webhook_event', 'stripe_connect_account',
    'stripe_payment_method', 'consultation_commission_configuration', 'doctor_payout', 'doctor_payout_item',
    'doctor_payout_adjustment', 'doctor_payout_adjustment_application'] loop
    if to_regclass('public.' || quote_ident(v_table)) is null then
      raise exception '0017 requiere la tabla % (esquema 0000–0016)', v_table using errcode = 'P0001';
    end if;
    execute format('select count(*) from public.%I', v_table) into v_rows;
    if v_rows > 0 then
      v_nonempty := v_nonempty || format(' %s=%s', v_table, v_rows);
    end if;
  end loop;
  if v_nonempty <> '' then
    raise exception '0017 solo implementa el camino directo (tablas de pagos vacías). Tablas con filas:%. No se modificó nada: ejecute el preflight y decida la migración de datos', v_nonempty
      using errcode = 'P0001';
  end if;
end $$;

-- ------------------------------------------------------------------------------------------------------------
-- 1. Retiro de las estructuras de Stripe y de las tablas que se recrean (todas vacías)
-- ------------------------------------------------------------------------------------------------------------
drop table doctor_payout_adjustment_application;
drop table doctor_payout_adjustment;
drop table doctor_payout_item;
drop table doctor_payout;
drop table refund;
drop table payment;
drop table stripe_webhook_event;
drop table stripe_payment_method;
drop table stripe_connect_account;
drop table consultation_commission_configuration;

drop type payment_status_enum;
drop type stripe_connect_status_enum;
drop type stripe_payment_method_status_enum;

-- ------------------------------------------------------------------------------------------------------------
-- 2. Tipos
-- ------------------------------------------------------------------------------------------------------------
create type payment_status_enum as enum ('pending', 'processing', 'succeeded', 'failed', 'canceled', 'refunded',
  'partially_refunded', 'charged_back', 'in_dispute');
create type payment_provider_enum as enum ('mercado_pago');
create type provider_webhook_event_status_enum as enum ('received', 'processing', 'processed', 'failed', 'ignored');
create type doctor_ledger_entry_type_enum as enum ('consultation_earning', 'refund_reversal', 'chargeback');
create type doctor_ledger_source_type_enum as enum ('payment', 'refund_adjustment', 'item_revocation', 'dispute');

-- ------------------------------------------------------------------------------------------------------------
-- 3. Configuración versionada: comisión fija de PEI, periodicidad de liquidación y tarifa del procesador
--    Sin valores predeterminados ni filas iniciales (PAY-06, PAY-08).
-- ------------------------------------------------------------------------------------------------------------
create table pei_fee_configuration (
  id uuid primary key default gen_random_uuid(),
  fixed_fee numeric(12,2) not null,
  currency varchar(3) not null default 'MXN',
  effective_from timestamptz not null,
  effective_until timestamptz,
  created_by uuid not null references user_profile(id),
  created_at timestamptz not null default now(),
  constraint pei_fee_configuration_fee_chk check (fixed_fee >= 0),
  constraint pei_fee_configuration_currency_chk check (currency = 'MXN'),
  constraint pei_fee_configuration_period_chk check (effective_until is null or effective_until > effective_from),
  constraint pei_fee_configuration_no_overlap exclude using gist (tstzrange(effective_from, effective_until) with &&)
);
create index pei_fee_configuration_effective_from_idx on pei_fee_configuration (effective_from);

create table payout_schedule_configuration (
  id uuid primary key default gen_random_uuid(),
  payout_frequency payout_frequency_enum not null,
  effective_from timestamptz not null,
  effective_until timestamptz,
  created_by uuid not null references user_profile(id),
  created_at timestamptz not null default now(),
  constraint payout_schedule_configuration_period_chk check (effective_until is null or effective_until > effective_from),
  constraint payout_schedule_configuration_no_overlap exclude using gist (tstzrange(effective_from, effective_until) with &&)
);
create index payout_schedule_configuration_effective_from_idx on payout_schedule_configuration (effective_from);

create table processor_fee_schedule (
  id uuid primary key default gen_random_uuid(),
  provider payment_provider_enum not null,
  percentage_rate numeric(7,6) not null,
  fixed_fee numeric(12,2) not null,
  vat_rate numeric(7,6) not null,
  release_days integer not null,
  currency varchar(3) not null default 'MXN',
  source text not null,
  effective_from timestamptz not null,
  effective_until timestamptz,
  created_by uuid not null references user_profile(id),
  created_at timestamptz not null default now(),
  constraint processor_fee_schedule_rates_chk check (percentage_rate >= 0 and percentage_rate < 1 and vat_rate >= 0 and vat_rate < 1),
  constraint processor_fee_schedule_fee_chk check (fixed_fee >= 0 and release_days >= 0),
  constraint processor_fee_schedule_currency_chk check (currency = 'MXN'),
  constraint processor_fee_schedule_source_chk check (length(trim(source)) > 0),
  constraint processor_fee_schedule_period_chk check (effective_until is null or effective_until > effective_from)
);
create index processor_fee_schedule_provider_from_idx on processor_fee_schedule (provider, effective_from);

-- Sin btree_gist no se puede excluir por (provider, rango): el solapamiento por proveedor se valida aquí, con un
-- candado transaccional por proveedor.
create or replace function gst_processor_fee_no_overlap() returns trigger
language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext('processor_fee_schedule:' || new.provider::text));
  if exists (select 1 from processor_fee_schedule s
              where s.provider = new.provider and s.id <> new.id
                and tstzrange(s.effective_from, s.effective_until) && tstzrange(new.effective_from, new.effective_until)) then
    raise exception 'La tarifa del procesador % se solapa con otra vigente', new.provider using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger processor_fee_schedule_no_overlap before insert or update on processor_fee_schedule
  for each row execute function gst_processor_fee_no_overlap();

create trigger pei_fee_configuration_versioned before update or delete on pei_fee_configuration
  for each row execute function gst_versioned_config_guard();
create trigger pei_fee_configuration_no_truncate before truncate on pei_fee_configuration
  for each statement execute function gst_versioned_config_no_truncate();
create trigger payout_schedule_configuration_versioned before update or delete on payout_schedule_configuration
  for each row execute function gst_versioned_config_guard();
create trigger payout_schedule_configuration_no_truncate before truncate on payout_schedule_configuration
  for each statement execute function gst_versioned_config_no_truncate();
create trigger processor_fee_schedule_versioned before update or delete on processor_fee_schedule
  for each row execute function gst_versioned_config_guard();
create trigger processor_fee_schedule_no_truncate before truncate on processor_fee_schedule
  for each statement execute function gst_versioned_config_no_truncate();

-- TRUNCATE prohibido en las tablas financieras (genérico).
create or replace function gst_no_truncate() returns trigger
language plpgsql as $$
begin
  raise exception 'La tabla % no admite TRUNCATE', tg_table_name using errcode = 'P0001';
end;
$$;

-- ------------------------------------------------------------------------------------------------------------
-- 4. Pagos (PAY-02, PAY-04, PAY-07, PAY-08, PAY-10, PAY-11, PAY-12, PAY-13; AP-27a)
-- ------------------------------------------------------------------------------------------------------------
create table payment (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references doctor_profile(id),
  patient_id uuid not null references patient_profile(id),
  appointment_id uuid references appointment(id),
  medication_order_id uuid references medication_order(id),
  type payment_type_enum not null,
  provider payment_provider_enum not null,
  provider_payment_id varchar,
  provider_status varchar,
  status payment_status_enum not null default 'pending',
  amount numeric(12,2) not null,
  currency varchar(3) not null default 'MXN',
  pei_fee_configuration_id uuid references pei_fee_configuration(id),
  pei_fixed_fee numeric(12,2),
  doctor_net_amount numeric(12,2) not null,
  processor_fee_schedule_id uuid not null references processor_fee_schedule(id),
  provider_fee_estimated numeric(12,2) not null,
  provider_fee_actual numeric(12,2),
  net_received_amount numeric(12,2),
  money_release_date timestamptz,
  fee_reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_amount_chk check (amount > 0),
  constraint payment_currency_chk check (currency = 'MXN'),
  constraint payment_type_reference_chk check ((type = 'consultation' and appointment_id is not null and medication_order_id is null)
    or (type = 'medication' and medication_order_id is not null and appointment_id is null)),
  constraint payment_doctor_net_nonnegative_chk check (doctor_net_amount >= 0),
  constraint payment_consultation_split_chk check (type <> 'consultation' or (doctor_id is not null
    and pei_fee_configuration_id is not null and pei_fixed_fee is not null and pei_fixed_fee >= 0
    and doctor_net_amount = amount - pei_fixed_fee)),
  constraint payment_medication_split_chk check (type <> 'medication' or (pei_fee_configuration_id is null
    and pei_fixed_fee is null and doctor_net_amount = 0)),
  constraint payment_provider_fee_chk check (provider_fee_estimated >= 0 and (provider_fee_actual is null or provider_fee_actual >= 0)
    and (net_received_amount is null or net_received_amount >= 0)),
  constraint payment_fee_reconciled_chk check (fee_reconciled_at is null or provider_fee_actual is not null),
  constraint payment_provider_payment_id_chk check (provider_payment_id is null or length(trim(provider_payment_id)) > 0),
  constraint payment_provider_reference_chk check (status in ('pending', 'failed', 'canceled') or provider_payment_id is not null),
  constraint payment_provider_payment_uq unique (provider, provider_payment_id)
);
create index payment_doctor_idx on payment (doctor_id);
create index payment_patient_idx on payment (patient_id);
create index payment_appointment_idx on payment (appointment_id);
create index payment_medication_order_idx on payment (medication_order_id);
create index payment_type_idx on payment (type);
create index payment_status_idx on payment (status);
create index payment_created_at_idx on payment (created_at);
-- PAY-14 / AP-27a: un solo pago activo (pendiente, en proceso o capturado) por cita raíz y por pedido.
create unique index payment_active_appointment_uq on payment (appointment_id)
  where type = 'consultation' and status not in ('failed', 'canceled');
create unique index payment_active_medication_order_uq on payment (medication_order_id)
  where type = 'medication' and status not in ('failed', 'canceled');

-- Snapshot inmutable; referencias del proveedor y conciliación se fijan una sola vez; transiciones monótonas.
create or replace function gst_payment_guard() returns trigger
language plpgsql as $$
declare
  v_allowed text[];
begin
  if (new.id, new.doctor_id, new.patient_id, new.appointment_id, new.medication_order_id, new.type, new.provider,
      new.amount, new.currency, new.pei_fee_configuration_id, new.pei_fixed_fee, new.doctor_net_amount,
      new.processor_fee_schedule_id, new.provider_fee_estimated, new.created_at)
     is distinct from
     (old.id, old.doctor_id, old.patient_id, old.appointment_id, old.medication_order_id, old.type, old.provider,
      old.amount, old.currency, old.pei_fee_configuration_id, old.pei_fixed_fee, old.doctor_net_amount,
      old.processor_fee_schedule_id, old.provider_fee_estimated, old.created_at) then
    raise exception 'El snapshot de un pago no se modifica' using errcode = 'P0001';
  end if;
  if old.provider_payment_id is not null and new.provider_payment_id is distinct from old.provider_payment_id then
    raise exception 'La referencia del proveedor de un pago se fija una sola vez' using errcode = 'P0001';
  end if;
  if (old.provider_fee_actual is not null and new.provider_fee_actual is distinct from old.provider_fee_actual)
     or (old.net_received_amount is not null and new.net_received_amount is distinct from old.net_received_amount)
     or (old.money_release_date is not null and new.money_release_date is distinct from old.money_release_date)
     or (old.fee_reconciled_at is not null and new.fee_reconciled_at is distinct from old.fee_reconciled_at) then
    raise exception 'Los datos de conciliación de un pago se fijan una sola vez' using errcode = 'P0001';
  end if;
  if new.status <> old.status then
    v_allowed := case old.status
      when 'pending' then array['processing', 'succeeded', 'failed', 'canceled']
      when 'processing' then array['succeeded', 'failed', 'canceled']
      when 'succeeded' then array['partially_refunded', 'refunded', 'in_dispute']
      when 'partially_refunded' then array['refunded', 'in_dispute']
      when 'in_dispute' then array['succeeded', 'partially_refunded', 'charged_back']
      else array[]::text[]
    end;
    if not (new.status::text = any (v_allowed)) then
      raise exception 'Transición de pago no permitida: % → %', old.status, new.status using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger payment_guard before update on payment
  for each row execute function gst_payment_guard();
create trigger payment_no_delete before delete on payment
  for each row execute function gst_append_only();
create trigger payment_no_truncate before truncate on payment
  for each statement execute function gst_no_truncate();

-- ------------------------------------------------------------------------------------------------------------
-- 5. Reembolsos (RF-46; PAY-17, PAY-18; prorrata §2.3)
-- ------------------------------------------------------------------------------------------------------------
create table refund (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payment(id),
  amount numeric(12,2) not null,
  currency varchar(3) not null default 'MXN',
  reason refund_reason_enum not null,
  status refund_status_enum not null default 'requested',
  provider payment_provider_enum not null,
  provider_refund_id varchar,
  provider_status varchar,
  pei_fee_share numeric(12,2) not null,
  doctor_share numeric(12,2) not null,
  provider_fee_returned numeric(12,2),
  unrecovered_provider_fee numeric(12,2),
  requested_by_type cancellation_actor_type_enum,
  requested_by_user_profile_id uuid references user_profile(id),
  approved_by uuid references user_profile(id),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  failure_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint refund_amount_chk check (amount > 0),
  constraint refund_currency_chk check (currency = 'MXN'),
  constraint refund_shares_chk check (pei_fee_share >= 0 and doctor_share >= 0 and pei_fee_share + doctor_share = amount),
  constraint refund_provider_fee_chk check ((provider_fee_returned is null or provider_fee_returned >= 0)
    and (unrecovered_provider_fee is null or unrecovered_provider_fee >= 0)),
  constraint refund_provider_refund_id_chk check (provider_refund_id is null or length(trim(provider_refund_id)) > 0),
  constraint refund_succeeded_reference_chk check (status <> 'succeeded' or (provider_refund_id is not null and processed_at is not null)),
  constraint refund_provider_refund_uq unique (provider, provider_refund_id)
);
create index refund_payment_idx on refund (payment_id);
create index refund_status_idx on refund (status);
create index refund_created_at_idx on refund (created_at);
-- C-29 (M08 CC-4): un solo reembolso activo por pago por error de pago (not_confirmable).
create unique index refund_payment_error_uq on refund (payment_id)
  where reason = 'payment_error' and status not in ('failed', 'canceled');

-- 0001 §6, con numeric(12,2): el acumulado de reembolsos no supera el pago.
create or replace function gst_refund_within_payment() returns trigger
language plpgsql as $$
declare
  v_payment_amount numeric(12,2);
  v_refunded numeric(12,2);
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
  before insert or update on refund
  for each row execute function gst_refund_within_payment();

-- Alta: pago capturado, mismo proveedor, prorrata acumulativa exacta (I-8) y aprobación de los parciales (PAY-17).
-- Cambios: datos inmutables, referencias fijadas una vez y transiciones monótonas.
create or replace function gst_refund_guard() returns trigger
language plpgsql as $$
declare
  v_payment payment%rowtype;
  v_prev_amount numeric(12,2);
  v_prev_pei numeric(12,2);
  v_pei_cum numeric(12,2);
  v_allowed text[];
begin
  select * into v_payment from payment where id = new.payment_id for update;
  if tg_op = 'INSERT' then
    if v_payment.status not in ('succeeded', 'partially_refunded') then
      raise exception 'Solo se reembolsa un pago capturado (estado %)', v_payment.status using errcode = 'P0001';
    end if;
    if new.provider <> v_payment.provider or new.currency <> v_payment.currency then
      raise exception 'El reembolso debe usar el proveedor y la moneda del pago' using errcode = 'P0001';
    end if;
    if new.status <> 'requested' then
      raise exception 'Un reembolso nace en requested' using errcode = 'P0001';
    end if;
    select coalesce(sum(amount), 0), coalesce(sum(pei_fee_share), 0) into v_prev_amount, v_prev_pei
      from refund where payment_id = new.payment_id and status not in ('failed', 'canceled');
    if v_payment.type = 'medication' then
      if new.pei_fee_share <> new.amount or new.doctor_share <> 0 then
        raise exception 'Un reembolso de medicamento es 100 %% de PEI' using errcode = 'P0001';
      end if;
    else
      v_pei_cum := round((v_prev_amount + new.amount) * v_payment.pei_fixed_fee / v_payment.amount, 2);
      if new.pei_fee_share <> v_pei_cum - v_prev_pei or new.doctor_share <> new.amount - (v_pei_cum - v_prev_pei) then
        raise exception 'La distribución del reembolso no sigue la prorrata: esperado PEI %, médico %',
          v_pei_cum - v_prev_pei, new.amount - (v_pei_cum - v_prev_pei) using errcode = 'P0001';
      end if;
    end if;
  else
    if (new.id, new.payment_id, new.amount, new.currency, new.reason, new.provider, new.pei_fee_share, new.doctor_share,
        new.requested_by_type, new.requested_by_user_profile_id, new.requested_at, new.created_at)
       is distinct from
       (old.id, old.payment_id, old.amount, old.currency, old.reason, old.provider, old.pei_fee_share, old.doctor_share,
        old.requested_by_type, old.requested_by_user_profile_id, old.requested_at, old.created_at) then
      raise exception 'Los datos de un reembolso no se modifican' using errcode = 'P0001';
    end if;
    if (old.provider_refund_id is not null and new.provider_refund_id is distinct from old.provider_refund_id)
       or (old.approved_by is not null and new.approved_by is distinct from old.approved_by)
       or (old.processed_at is not null and new.processed_at is distinct from old.processed_at)
       or (old.provider_fee_returned is not null and new.provider_fee_returned is distinct from old.provider_fee_returned)
       or (old.unrecovered_provider_fee is not null and new.unrecovered_provider_fee is distinct from old.unrecovered_provider_fee) then
      raise exception 'Las referencias y la conciliación de un reembolso se fijan una sola vez' using errcode = 'P0001';
    end if;
    if new.status <> old.status then
      v_allowed := case old.status
        when 'requested' then array['pending', 'canceled']
        when 'pending' then array['processing', 'canceled', 'failed']
        when 'processing' then array['succeeded', 'failed']
        else array[]::text[]
      end;
      if not (new.status::text = any (v_allowed)) then
        raise exception 'Transición de reembolso no permitida: % → %', old.status, new.status using errcode = 'P0001';
      end if;
    end if;
  end if;
  if new.amount < v_payment.amount and new.status not in ('requested', 'canceled') and new.approved_by is null then
    raise exception 'Un reembolso parcial requiere aprobación administrativa' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger refund_guard before insert or update on refund
  for each row execute function gst_refund_guard();
create trigger refund_no_delete before delete on refund
  for each row execute function gst_append_only();
create trigger refund_no_truncate before truncate on refund
  for each statement execute function gst_no_truncate();

-- ------------------------------------------------------------------------------------------------------------
-- 6. Webhooks e idempotencia (PAY-14, PAY-15)
-- ------------------------------------------------------------------------------------------------------------
create table provider_webhook_event (
  id uuid primary key default gen_random_uuid(),
  provider payment_provider_enum not null,
  topic varchar not null,
  action varchar,
  data_id varchar not null,
  request_id varchar not null,
  signature_valid boolean not null,
  payload jsonb not null,
  status provider_webhook_event_status_enum not null default 'received',
  payment_id uuid references payment(id),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_attempts integer not null default 0,
  last_error text,
  constraint provider_webhook_event_keys_chk check (length(trim(topic)) > 0 and length(trim(data_id)) > 0 and length(trim(request_id)) > 0),
  constraint provider_webhook_event_attempts_chk check (processing_attempts >= 0),
  constraint provider_webhook_event_signature_chk check (signature_valid or status in ('received', 'ignored')),
  constraint provider_webhook_event_processed_chk check (status <> 'processed' or processed_at is not null),
  constraint provider_webhook_event_uq unique (provider, topic, data_id, request_id)
);
create index provider_webhook_event_status_idx on provider_webhook_event (status);
create index provider_webhook_event_received_idx on provider_webhook_event (received_at);
create index provider_webhook_event_payment_idx on provider_webhook_event (payment_id);

create or replace function gst_provider_webhook_event_guard() returns trigger
language plpgsql as $$
begin
  if (new.id, new.provider, new.topic, new.action, new.data_id, new.request_id, new.signature_valid, new.payload, new.received_at)
     is distinct from
     (old.id, old.provider, old.topic, old.action, old.data_id, old.request_id, old.signature_valid, old.payload, old.received_at) then
    raise exception 'Un evento de webhook recibido no se modifica' using errcode = 'P0001';
  end if;
  if old.payment_id is not null and new.payment_id is distinct from old.payment_id then
    raise exception 'El pago de un evento de webhook se fija una sola vez' using errcode = 'P0001';
  end if;
  if old.status in ('processed', 'ignored') and new.status <> old.status then
    raise exception 'Un evento % no cambia de estado', old.status using errcode = 'P0001';
  end if;
  if new.processing_attempts < old.processing_attempts then
    raise exception 'Los intentos de procesamiento no disminuyen' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger provider_webhook_event_guard before update on provider_webhook_event
  for each row execute function gst_provider_webhook_event_guard();
create trigger provider_webhook_event_no_delete before delete on provider_webhook_event
  for each row execute function gst_append_only();
create trigger provider_webhook_event_no_truncate before truncate on provider_webhook_event
  for each statement execute function gst_no_truncate();

create table idempotency_key (
  id uuid primary key default gen_random_uuid(),
  scope varchar not null,
  key varchar not null,
  request_hash varchar(64) not null,
  payment_id uuid references payment(id),
  refund_id uuid references refund(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint idempotency_key_values_chk check (length(trim(scope)) > 0 and length(trim(key)) > 0),
  constraint idempotency_key_hash_chk check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint idempotency_key_uq unique (scope, key)
);

create or replace function gst_idempotency_key_guard() returns trigger
language plpgsql as $$
begin
  if (new.id, new.scope, new.key, new.request_hash, new.created_at) is distinct from (old.id, old.scope, old.key, old.request_hash, old.created_at)
     or (old.payment_id is not null and new.payment_id is distinct from old.payment_id)
     or (old.refund_id is not null and new.refund_id is distinct from old.refund_id)
     or (old.completed_at is not null and new.completed_at is distinct from old.completed_at) then
    raise exception 'Una clave de idempotencia solo admite fijar su resultado una vez' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger idempotency_key_guard before update on idempotency_key
  for each row execute function gst_idempotency_key_guard();
create trigger idempotency_key_no_delete before delete on idempotency_key
  for each row execute function gst_append_only();
create trigger idempotency_key_no_truncate before truncate on idempotency_key
  for each statement execute function gst_no_truncate();

-- ------------------------------------------------------------------------------------------------------------
-- 7. Liquidaciones: payout (PAY-05, transferencia manual)
-- ------------------------------------------------------------------------------------------------------------
create table doctor_payout (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references doctor_profile(id),
  period_start timestamptz not null,
  period_end timestamptz not null,
  gross_amount numeric(12,2) not null,
  adjustment_amount numeric(12,2) not null default '0',
  net_amount numeric(12,2) not null,
  transferred_amount numeric(12,2) not null default '0',
  currency varchar(3) not null default 'MXN',
  status payout_status_enum not null default 'pending',
  provider_transfer_id varchar,
  transfer_method varchar,
  transfer_reference varchar,
  transferred_by_user_id uuid references user_profile(id),
  transfer_evidence_ref text,
  paid_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint doctor_payout_provider_transfer_id_unique unique (provider_transfer_id),
  constraint doctor_payout_period_chk check (period_end > period_start),
  constraint doctor_payout_net_chk check (net_amount = gross_amount + adjustment_amount),
  constraint doctor_payout_currency_chk check (currency = 'MXN'),
  constraint doctor_payout_transfer_method_chk check (transfer_method is null or transfer_method = 'manual'),
  constraint doctor_payout_paid_chk check (status <> 'paid' or (paid_at is not null and transfer_method is not null
    and transfer_reference is not null and length(trim(transfer_reference)) > 0 and transferred_by_user_id is not null
    and transferred_amount = net_amount))
);
create index doctor_payout_doctor_idx on doctor_payout (doctor_id);
create index doctor_payout_status_idx on doctor_payout (status);
create index doctor_payout_period_start_idx on doctor_payout (period_start);
create unique index doctor_payout_period_uq on doctor_payout (doctor_id, period_start, period_end);

create trigger payout_immutable_after_transfer
  before update or delete on doctor_payout
  for each row execute function gst_payout_immutable_after_transfer();
create trigger doctor_payout_no_truncate before truncate on doctor_payout
  for each statement execute function gst_no_truncate();

-- ------------------------------------------------------------------------------------------------------------
-- 8. Ledger del médico (PAY-09; §3.5, I-1, I-2, I-7, I-10)
-- ------------------------------------------------------------------------------------------------------------
create table doctor_ledger_entry (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references doctor_profile(id),
  payment_id uuid not null references payment(id),
  entry_type doctor_ledger_entry_type_enum not null,
  source_type doctor_ledger_source_type_enum not null,
  source_ref text not null,
  amount numeric(12,2) not null,
  refund_id uuid references refund(id),
  reverses_entry_id uuid references doctor_ledger_entry(id),
  created_by_type audit_actor_type_enum not null,
  created_by_user_id uuid references user_profile(id),
  created_at timestamptz not null default now(),
  constraint doctor_ledger_entry_key_uq unique (entry_type, source_type, source_ref),
  constraint doctor_ledger_entry_source_ref_chk check (length(source_ref) > 0),
  constraint doctor_ledger_entry_sign_chk check ((entry_type = 'consultation_earning' and amount > 0)
    or (entry_type in ('refund_reversal', 'chargeback') and amount < 0)),
  constraint doctor_ledger_entry_source_chk check ((entry_type = 'consultation_earning' and source_type = 'payment')
    or (entry_type = 'refund_reversal' and source_type in ('refund_adjustment', 'item_revocation'))
    or (entry_type = 'chargeback' and source_type = 'dispute')),
  constraint doctor_ledger_entry_refund_chk check ((source_type in ('refund_adjustment', 'item_revocation')) = (refund_id is not null)),
  constraint doctor_ledger_entry_reverses_chk check ((source_type = 'item_revocation') = (reverses_entry_id is not null)),
  constraint doctor_ledger_entry_source_ref_format_chk check (
    (source_type = 'payment' and source_ref = payment_id::text)
    or (source_type = 'item_revocation' and source_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    or (source_type = 'refund_adjustment' and source_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:'
        and split_part(source_ref, ':', 2) = refund_id::text)
    or (source_type = 'dispute' and source_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:.+$')),
  constraint doctor_ledger_entry_creator_chk check ((created_by_type = 'user' and created_by_user_id is not null)
    or (created_by_type = 'system' and created_by_user_id is null))
);
create index doctor_ledger_entry_doctor_idx on doctor_ledger_entry (doctor_id);
create index doctor_ledger_entry_payment_idx on doctor_ledger_entry (payment_id);
create index doctor_ledger_entry_refund_idx on doctor_ledger_entry (refund_id);
create unique index doctor_ledger_entry_earning_uq on doctor_ledger_entry (payment_id) where entry_type = 'consultation_earning';
create unique index doctor_ledger_entry_reverses_uq on doctor_ledger_entry (reverses_entry_id) where reverses_entry_id is not null;

-- Coherencia del asiento con su pago, reembolso o asiento de origen.
create or replace function gst_ledger_entry_insert() returns trigger
language plpgsql as $$
declare
  v_payment payment%rowtype;
  v_refund refund%rowtype;
  v_origin doctor_ledger_entry%rowtype;
begin
  select * into v_payment from payment where id = new.payment_id;
  if v_payment.type <> 'consultation' then
    raise exception 'Solo los pagos de consulta generan asientos del médico' using errcode = 'P0001';
  end if;
  if v_payment.doctor_id is distinct from new.doctor_id then
    raise exception 'El asiento y el pago pertenecen a médicos distintos' using errcode = 'P0001';
  end if;
  if new.entry_type = 'consultation_earning' then
    if v_payment.status <> 'succeeded' then
      raise exception 'El pago % no está en succeeded', new.payment_id using errcode = 'P0001';
    end if;
    if new.amount <> v_payment.doctor_net_amount then
      raise exception 'El asiento de origen (%) debe ser el neto del médico (%)', new.amount, v_payment.doctor_net_amount
        using errcode = 'P0001';
    end if;
  elsif new.source_type in ('refund_adjustment', 'item_revocation') then
    select * into v_refund from refund where id = new.refund_id;
    if v_refund.payment_id <> new.payment_id then
      raise exception 'El reembolso no corresponde al pago del asiento' using errcode = 'P0001';
    end if;
    if v_refund.status <> 'succeeded' then
      raise exception 'El reembolso % no está en succeeded', new.refund_id using errcode = 'P0001';
    end if;
    if new.amount <> -v_refund.doctor_share then
      raise exception 'La reversión (%) debe ser la parte del médico del reembolso (%)', new.amount, -v_refund.doctor_share
        using errcode = 'P0001';
    end if;
    if new.source_type = 'item_revocation' then
      select * into v_origin from doctor_ledger_entry where id = new.reverses_entry_id;
      if v_origin.entry_type <> 'consultation_earning' or v_origin.payment_id <> new.payment_id then
        raise exception 'Una revocación revierte el asiento de origen de su mismo pago' using errcode = 'P0001';
      end if;
      if new.amount <> -v_origin.amount then
        raise exception 'La revocación (%) debe compensar exactamente el asiento de origen (%)', new.amount, v_origin.amount
          using errcode = 'P0001';
      end if;
    end if;
  elsif new.entry_type = 'chargeback' then
    if v_payment.status <> 'charged_back' then
      raise exception 'Un contracargo requiere el pago en charged_back' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger ledger_entry_insert before insert on doctor_ledger_entry
  for each row execute function gst_ledger_entry_insert();
create trigger ledger_entry_append_only before update or delete on doctor_ledger_entry
  for each row execute function gst_append_only();
create trigger ledger_entry_no_truncate before truncate on doctor_ledger_entry
  for each statement execute function gst_no_truncate();

-- ------------------------------------------------------------------------------------------------------------
-- 9. Unidades de liquidación: items, ajustes y aplicaciones (C-4 alternativa B)
-- ------------------------------------------------------------------------------------------------------------
create table doctor_payout_item (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid references doctor_payout(id),
  payment_id uuid not null references payment(id),
  amount numeric(12,2) not null,
  eligible_at timestamptz not null,
  eligibility_status doctor_payout_item_eligibility_enum not null default 'eligible',
  eligibility_revoked_at timestamptz,
  eligibility_revoked_reason text,
  ledger_entry_id uuid not null references doctor_ledger_entry(id),
  revocation_ledger_entry_id uuid references doctor_ledger_entry(id),
  created_at timestamptz not null default now(),
  constraint doctor_payout_item_payment_id_unique unique (payment_id),
  constraint doctor_payout_item_ledger_entry_id_unique unique (ledger_entry_id),
  constraint doctor_payout_item_revocation_ledger_entry_id_unique unique (revocation_ledger_entry_id),
  constraint doctor_payout_item_amount_chk check (amount > 0),
  constraint doctor_payout_item_revoked_chk check (eligibility_status <> 'revoked' or eligibility_revoked_at is not null),
  constraint doctor_payout_item_revocation_chk check ((eligibility_status = 'revoked') = (revocation_ledger_entry_id is not null))
);
create index doctor_payout_item_payout_idx on doctor_payout_item (payout_id);
create index doctor_payout_item_payment_idx on doctor_payout_item (payment_id);
create index doctor_payout_item_eligible_at_idx on doctor_payout_item (eligible_at);
create index doctor_payout_item_eligibility_idx on doctor_payout_item (eligibility_status);

create table doctor_payout_adjustment (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references doctor_profile(id),
  source_payout_id uuid references doctor_payout(id),
  doctor_payout_item_id uuid references doctor_payout_item(id),
  appointment_id uuid references appointment(id),
  payment_id uuid references payment(id),
  type doctor_payout_adjustment_type_enum not null,
  amount numeric(12,2) not null,
  reason text not null,
  created_by_type audit_actor_type_enum not null,
  created_by_user_id uuid references user_profile(id),
  external_reference varchar,
  ledger_entry_id uuid not null references doctor_ledger_entry(id),
  created_at timestamptz not null default now(),
  constraint doctor_payout_adjustment_ledger_entry_id_unique unique (ledger_entry_id),
  constraint doctor_payout_adjustment_amount_chk check (amount <> 0),
  constraint doctor_payout_adjustment_creator_chk check ((created_by_type = 'user' and created_by_user_id is not null)
    or (created_by_type = 'system' and created_by_user_id is null)),
  -- §3.5.2: en F1 solo refund_reversal y chargeback (correction y other quedan para una extensión futura).
  constraint doctor_payout_adjustment_type_f1_chk check (type in ('refund_reversal', 'chargeback')),
  constraint doctor_payout_adjustment_item_required_chk check (type not in ('refund_reversal', 'chargeback')
    or (doctor_payout_item_id is not null and payment_id is not null)),
  constraint doctor_payout_adjustment_sign_chk check (type not in ('refund_reversal', 'chargeback') or amount < 0),
  constraint doctor_payout_adjustment_origin_chk check (source_payout_id is not null or doctor_payout_item_id is not null)
);
create index doctor_payout_adjustment_doctor_idx on doctor_payout_adjustment (doctor_id);
create index doctor_payout_adjustment_source_idx on doctor_payout_adjustment (source_payout_id);
create index doctor_payout_adjustment_payment_idx on doctor_payout_adjustment (payment_id);
create index doctor_payout_adjustment_item_idx on doctor_payout_adjustment (doctor_payout_item_id);

create table doctor_payout_adjustment_application (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid not null references doctor_payout_adjustment(id),
  applied_payout_id uuid not null references doctor_payout(id),
  amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  constraint doctor_payout_adjustment_application_amount_chk check (amount <> 0)
);
create index doctor_payout_adjustment_application_adjustment_idx on doctor_payout_adjustment_application (adjustment_id);
create index doctor_payout_adjustment_application_payout_idx on doctor_payout_adjustment_application (applied_payout_id);

-- Alta de un importe: pago de consulta exitoso, por el neto del médico, con su asiento de origen (I-2).
create or replace function gst_payout_item_insert() returns trigger
language plpgsql as $$
declare
  v_payment payment%rowtype;
  v_entry doctor_ledger_entry%rowtype;
begin
  select * into v_payment from payment where id = new.payment_id;
  if v_payment.type <> 'consultation' then
    raise exception 'Solo los pagos de consulta generan importe liquidable'
      using errcode = 'P0001';
  end if;
  if v_payment.status <> 'succeeded' then
    raise exception 'El pago % no está en succeeded', new.payment_id
      using errcode = 'P0001';
  end if;
  if new.amount <> v_payment.doctor_net_amount then
    raise exception 'El importe del médico (%) no coincide con el neto registrado en el pago (%)',
      new.amount, v_payment.doctor_net_amount
      using errcode = 'P0001';
  end if;
  if new.eligibility_status = 'revoked' or new.revocation_ledger_entry_id is not null then
    raise exception 'Un importe no nace revocado' using errcode = 'P0001';
  end if;
  select * into v_entry from doctor_ledger_entry where id = new.ledger_entry_id;
  if v_entry.entry_type <> 'consultation_earning' or v_entry.payment_id <> new.payment_id or v_entry.amount <> new.amount then
    raise exception 'El importe debe apuntar al asiento de origen de su pago, por el mismo importe' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger payout_item_insert
  before insert on doctor_payout_item
  for each row execute function gst_payout_item_insert();

-- 0001 §7 más C-4: la revocación exige su asiento (I-7), solo sin ajustes y antes de liquidar, y es irreversible.
create or replace function gst_payout_item_update() returns trigger
language plpgsql as $$
declare
  v_old_payout_status payout_status_enum;
  v_new_payout_status payout_status_enum;
  v_new_payout_doctor uuid;
  v_payment_doctor uuid;
  v_entry doctor_ledger_entry%rowtype;
begin
  if new.payment_id <> old.payment_id or new.amount <> old.amount or new.eligible_at <> old.eligible_at
     or new.ledger_entry_id <> old.ledger_entry_id or new.created_at <> old.created_at then
    raise exception 'payment_id, amount, eligible_at y el asiento de un importe no se modifican'
      using errcode = 'P0001';
  end if;
  if old.revocation_ledger_entry_id is not null and new.revocation_ledger_entry_id is distinct from old.revocation_ledger_entry_id then
    raise exception 'El asiento de revocación se fija una sola vez' using errcode = 'P0001';
  end if;
  if old.eligibility_status = 'revoked' and new.eligibility_status <> 'revoked' then
    raise exception 'Una revocación es irreversible' using errcode = 'P0001';
  end if;

  if old.payout_id is not null then
    select status into v_old_payout_status from doctor_payout where id = old.payout_id;
  end if;

  if new.eligibility_status = 'revoked' and old.eligibility_status <> 'revoked' then
    if v_old_payout_status = 'paid' then
      raise exception 'Un importe ya transferido no se revoca: se registra un ajuste' using errcode = 'P0001';
    end if;
    if exists (select 1 from doctor_payout_adjustment a where a.doctor_payout_item_id = old.id) then
      raise exception 'Un importe con ajustes no se revoca' using errcode = 'P0001';
    end if;
    select * into v_entry from doctor_ledger_entry where id = new.revocation_ledger_entry_id;
    if v_entry.source_type is distinct from 'item_revocation' or v_entry.source_ref <> old.id::text
       or v_entry.reverses_entry_id <> old.ledger_entry_id or v_entry.amount <> -old.amount then
      raise exception 'La revocación debe apuntar a su asiento item_revocation, por el importe completo' using errcode = 'P0001';
    end if;
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
    raise exception 'Retire el importe del payout % antes de marcarlo como %', new.payout_id, new.eligibility_status
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger payout_item_update
  before update on doctor_payout_item
  for each row execute function gst_payout_item_update();
create trigger payout_item_no_delete
  before delete on doctor_payout_item
  for each row execute function gst_append_only();
create trigger payout_item_totals
  after insert or update of payout_id on doctor_payout_item
  for each row execute function gst_payout_item_totals();
create trigger doctor_payout_item_no_truncate before truncate on doctor_payout_item
  for each statement execute function gst_no_truncate();

-- C-4 (I-3, I-4, I-5, I-7): ajuste ligado a su item y a su asiento, con origen solo si el item ya se liquidó.
create or replace function gst_adjustment_insert() returns trigger
language plpgsql as $$
declare
  v_source_doctor uuid;
  v_item doctor_payout_item%rowtype;
  v_item_payout_status payout_status_enum;
  v_payment_doctor uuid;
  v_entry doctor_ledger_entry%rowtype;
  v_reversed numeric(12,2);
begin
  if new.source_payout_id is not null then
    select doctor_id into v_source_doctor from doctor_payout where id = new.source_payout_id;
    if v_source_doctor is distinct from new.doctor_id then
      raise exception 'El payout de origen no pertenece al médico del ajuste'
        using errcode = 'P0001';
    end if;
  end if;

  select * into v_item from doctor_payout_item where id = new.doctor_payout_item_id for update;
  if v_item.eligibility_status = 'revoked' then
    raise exception 'No se ajusta un importe revocado' using errcode = 'P0001';
  end if;
  if v_item.payment_id <> new.payment_id then
    raise exception 'El ajuste y su importe corresponden a pagos distintos' using errcode = 'P0001';
  end if;
  select doctor_id into v_payment_doctor from payment where id = new.payment_id;
  if v_payment_doctor is distinct from new.doctor_id then
    raise exception 'El ajuste y el pago pertenecen a médicos distintos' using errcode = 'P0001';
  end if;

  if v_item.payout_id is not null then
    select status into v_item_payout_status from doctor_payout where id = v_item.payout_id;
  end if;
  if v_item_payout_status = 'paid' then
    if new.source_payout_id is distinct from v_item.payout_id then
      raise exception 'El importe ya se liquidó: source_payout_id debe ser su payout %', v_item.payout_id using errcode = 'P0001';
    end if;
  elsif new.source_payout_id is not null and new.source_payout_id is distinct from v_item.payout_id then
    raise exception 'El importe no está liquidado: source_payout_id es nulo o su payout pendiente' using errcode = 'P0001';
  end if;

  select coalesce(sum(amount), 0) into v_reversed
    from doctor_payout_adjustment
   where doctor_payout_item_id = new.doctor_payout_item_id and type in ('refund_reversal', 'chargeback');
  if abs(v_reversed + new.amount) > v_item.amount then
    raise exception 'Las reversiones (%) superan el importe del médico (%)', abs(v_reversed + new.amount), v_item.amount
      using errcode = 'P0001';
  end if;

  select * into v_entry from doctor_ledger_entry where id = new.ledger_entry_id;
  if v_entry.amount <> new.amount or v_entry.payment_id <> new.payment_id or v_entry.doctor_id <> new.doctor_id
     or not ((new.type = 'refund_reversal' and v_entry.entry_type = 'refund_reversal' and v_entry.source_type = 'refund_adjustment')
          or (new.type = 'chargeback' and v_entry.entry_type = 'chargeback' and v_entry.source_type = 'dispute'))
     or split_part(v_entry.source_ref, ':', 1) <> new.doctor_payout_item_id::text then
    raise exception 'El ajuste debe apuntar a su asiento (mismo tipo, importe, pago, médico e importe de origen)' using errcode = 'P0001';
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
create trigger doctor_payout_adjustment_no_truncate before truncate on doctor_payout_adjustment
  for each statement execute function gst_no_truncate();

-- 0001 §8 con numeric(12,2).
create or replace function gst_adjustment_application_insert() returns trigger
language plpgsql as $$
declare
  v_adj_amount numeric(12,2);
  v_adj_doctor uuid;
  v_applied numeric(12,2);
  v_payout_status payout_status_enum;
  v_payout_doctor uuid;
  v_payout_net numeric(12,2);
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
create trigger adjustment_application_totals
  after insert on doctor_payout_adjustment_application
  for each row execute function gst_adjustment_application_totals();
create trigger adjustment_application_append_only
  before update or delete on doctor_payout_adjustment_application
  for each row execute function gst_append_only();
create trigger doctor_payout_adjustment_application_no_truncate before truncate on doctor_payout_adjustment_application
  for each statement execute function gst_no_truncate();

-- I-6: un payout pasa a paid solo con todos los ajustes de sus importes (sin origen o con origen en él) aplicados.
create or replace function gst_payout_paid_requires_adjustments() returns trigger
language plpgsql as $$
begin
  if new.status = 'paid' and old.status <> 'paid' and exists (
    select 1
      from doctor_payout_item i
      join doctor_payout_adjustment a on a.doctor_payout_item_id = i.id
     where i.payout_id = new.id
       and (a.source_payout_id is null or a.source_payout_id = new.id)
       and abs(a.amount) > abs(coalesce((select sum(x.amount) from doctor_payout_adjustment_application x
                                          where x.adjustment_id = a.id), 0))) then
    raise exception 'El payout % tiene ajustes de sus importes sin aplicar', new.id using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger payout_paid_requires_adjustments
  before update of status on doctor_payout
  for each row execute function gst_payout_paid_requires_adjustments();

-- I-2: al confirmar la transacción, cada asiento tiene exactamente una unidad de liquidación de su clase.
create or replace function gst_ledger_entry_has_unit() returns trigger
language plpgsql as $$
declare
  v_matching integer;
  v_any integer;
begin
  select case new.source_type
           when 'payment' then (select count(*) from doctor_payout_item where ledger_entry_id = new.id)
           when 'item_revocation' then (select count(*) from doctor_payout_item where revocation_ledger_entry_id = new.id)
           else (select count(*) from doctor_payout_adjustment where ledger_entry_id = new.id)
         end,
         (select count(*) from doctor_payout_item where ledger_entry_id = new.id or revocation_ledger_entry_id = new.id)
           + (select count(*) from doctor_payout_adjustment where ledger_entry_id = new.id)
    into v_matching, v_any;
  if v_matching <> 1 or v_any <> 1 then
    raise exception 'El asiento % no tiene exactamente una unidad de liquidación de su clase', new.id using errcode = 'P0001';
  end if;
  return null;
end;
$$;

create constraint trigger ledger_entry_has_unit
  after insert on doctor_ledger_entry
  deferrable initially deferred
  for each row execute function gst_ledger_entry_has_unit();

-- ------------------------------------------------------------------------------------------------------------
-- 10. Conciliación I-1 (solo lectura): médicos cuyo ledger no cuadra con sus unidades de liquidación.
--     Forma A: Σ ledger = Σ items (todos) + Σ asientos de revocación + Σ ajustes.
--     Forma B: Σ ledger = Σ items no revocados + Σ ajustes.
-- ------------------------------------------------------------------------------------------------------------
create or replace function gst_doctor_ledger_reconciliation()
returns table (doctor_id uuid, ledger_total numeric, form_a_total numeric, form_b_total numeric)
language sql stable as $$
  with doctors as (
    select l.doctor_id from doctor_ledger_entry l
    union select p.doctor_id from doctor_payout_item i join payment p on p.id = i.payment_id
    union select a.doctor_id from doctor_payout_adjustment a
  ), totals as (
    select d.doctor_id,
      coalesce((select sum(l.amount) from doctor_ledger_entry l where l.doctor_id = d.doctor_id), 0) as ledger_total,
      coalesce((select sum(i.amount) from doctor_payout_item i join payment p on p.id = i.payment_id
                 where p.doctor_id = d.doctor_id), 0)
        + coalesce((select sum(l.amount) from doctor_payout_item i join doctor_ledger_entry l on l.id = i.revocation_ledger_entry_id
                     where l.doctor_id = d.doctor_id), 0)
        + coalesce((select sum(a.amount) from doctor_payout_adjustment a where a.doctor_id = d.doctor_id), 0) as form_a_total,
      coalesce((select sum(i.amount) from doctor_payout_item i join payment p on p.id = i.payment_id
                 where p.doctor_id = d.doctor_id and i.eligibility_status <> 'revoked'), 0)
        + coalesce((select sum(a.amount) from doctor_payout_adjustment a where a.doctor_id = d.doctor_id), 0) as form_b_total
    from doctors d
  )
  select doctor_id, ledger_total, form_a_total, form_b_total from totals
   where ledger_total <> form_a_total or ledger_total <> form_b_total;
$$;

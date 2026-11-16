-- ============================================================================================================
-- Payments F1 · REVERSIÓN de 0017 · PROPUESTA, NO APLICADA EN NINGUNA BASE
-- ------------------------------------------------------------------------------------------------------------
-- Restaura exactamente el esquema 0000–0016 de pagos: las definiciones de tablas, tipos, claves e índices se copian
-- de 0000_init.sql y las funciones y triggers de 0001_triggers.sql (§6 a §8, y la exclusión de
-- consultation_commission_configuration de §9). Generado por copia literal: no se reescribe nada a mano.
-- Solo procede si TODAS las tablas de 0017 están vacías: no borra datos de pagos. Transaccional.
-- ============================================================================================================

do $$
declare
  v_table text;
  v_rows bigint;
  v_nonempty text := '';
begin
  if to_regclass('public.doctor_ledger_entry') is null then
    raise exception 'La reversión de 0017 requiere 0017 aplicada' using errcode = 'P0001';
  end if;
  foreach v_table in array array['payment', 'refund', 'provider_webhook_event', 'idempotency_key', 'pei_fee_configuration',
    'payout_schedule_configuration', 'processor_fee_schedule', 'doctor_payout', 'doctor_ledger_entry', 'doctor_payout_item',
    'doctor_payout_adjustment', 'doctor_payout_adjustment_application'] loop
    execute format('select count(*) from public.%I', v_table) into v_rows;
    if v_rows > 0 then
      v_nonempty := v_nonempty || format(' %s=%s', v_table, v_rows);
    end if;
  end loop;
  if v_nonempty <> '' then
    raise exception 'La reversión de 0017 no borra datos de pagos. Tablas con filas:%', v_nonempty using errcode = 'P0001';
  end if;
end $$;

drop table doctor_payout_adjustment_application;
drop table doctor_payout_adjustment;
drop table doctor_payout_item;
drop table doctor_ledger_entry;
drop table doctor_payout;
drop table idempotency_key;
drop table provider_webhook_event;
drop table refund;
drop table payment;
drop table processor_fee_schedule;
drop table payout_schedule_configuration;
drop table pei_fee_configuration;

drop function gst_doctor_ledger_reconciliation();
drop function gst_ledger_entry_has_unit();
drop function gst_payout_paid_requires_adjustments();
drop function gst_ledger_entry_insert();
drop function gst_idempotency_key_guard();
drop function gst_provider_webhook_event_guard();
drop function gst_refund_guard();
drop function gst_payment_guard();
drop function gst_processor_fee_no_overlap();
drop function gst_no_truncate();

drop type doctor_ledger_source_type_enum;
drop type doctor_ledger_entry_type_enum;
drop type provider_webhook_event_status_enum;
drop type payment_provider_enum;
drop type payment_status_enum;

-- ---- Copia literal de 0000_init.sql ------------------------------------------------------------------------
CREATE TYPE "public"."payment_status_enum" AS ENUM('pending', 'requires_action', 'succeeded', 'failed', 'canceled');
CREATE TYPE "public"."stripe_connect_status_enum" AS ENUM('pending', 'onboarding', 'restricted', 'enabled', 'disabled');
CREATE TYPE "public"."stripe_payment_method_status_enum" AS ENUM('active', 'detached');

CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid,
	"patient_id" uuid NOT NULL,
	"appointment_id" uuid,
	"medication_order_id" uuid,
	"type" "payment_type_enum" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'MXN' NOT NULL,
	"stripe_payment_intent_id" varchar NOT NULL,
	"stripe_charge_id" varchar,
	"status" "payment_status_enum" DEFAULT 'pending' NOT NULL,
	"doctor_percentage" numeric(5, 2),
	"platform_percentage" numeric(5, 2),
	"doctor_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"platform_amount" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id"),
	CONSTRAINT "payment_amount_chk" CHECK ("payment"."amount" > 0),
	CONSTRAINT "payment_medication_split_chk" CHECK ("payment"."type" <> 'medication' or ("payment"."platform_percentage" = 100 and "payment"."doctor_amount" = 0)),
	CONSTRAINT "payment_type_reference_chk" CHECK (("payment"."type" = 'consultation' and "payment"."appointment_id" is not null) or ("payment"."type" = 'medication' and "payment"."medication_order_id" is not null))
);

CREATE TABLE "refund" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'MXN' NOT NULL,
	"reason" "refund_reason_enum" NOT NULL,
	"status" "refund_status_enum" DEFAULT 'requested' NOT NULL,
	"stripe_refund_id" varchar,
	"requested_by_type" "cancellation_actor_type_enum",
	"requested_by_user_profile_id" uuid,
	"approved_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"failure_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refund_stripe_refund_id_unique" UNIQUE("stripe_refund_id"),
	CONSTRAINT "refund_amount_chk" CHECK ("refund"."amount" > 0)
);

CREATE TABLE "stripe_connect_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"stripe_account_id" varchar NOT NULL,
	"status" "stripe_connect_status_enum" DEFAULT 'pending' NOT NULL,
	"charges_enabled" boolean DEFAULT false NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"details_submitted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_connect_account_doctor_id_unique" UNIQUE("doctor_id"),
	CONSTRAINT "stripe_connect_account_stripe_account_id_unique" UNIQUE("stripe_account_id")
);

CREATE TABLE "stripe_payment_method" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"stripe_customer_id" varchar NOT NULL,
	"stripe_payment_method_id" varchar NOT NULL,
	"type" varchar DEFAULT 'card' NOT NULL,
	"brand" varchar,
	"last4" varchar(4),
	"exp_month" integer,
	"exp_year" integer,
	"status" "stripe_payment_method_status_enum" DEFAULT 'active' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_payment_method_stripe_payment_method_id_unique" UNIQUE("stripe_payment_method_id")
);

CREATE TABLE "stripe_webhook_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" varchar NOT NULL,
	"event_type" varchar NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar DEFAULT 'received' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	CONSTRAINT "stripe_webhook_event_stripe_event_id_unique" UNIQUE("stripe_event_id")
);

CREATE TABLE "consultation_commission_configuration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_percentage" numeric(5, 2) NOT NULL,
	"platform_percentage" numeric(5, 2) NOT NULL,
	"payout_frequency" "payout_frequency_enum" NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_percentages_range_chk" CHECK ("consultation_commission_configuration"."doctor_percentage" between 0 and 100 and "consultation_commission_configuration"."platform_percentage" between 0 and 100),
	CONSTRAINT "commission_percentages_sum_chk" CHECK ("consultation_commission_configuration"."doctor_percentage" + "consultation_commission_configuration"."platform_percentage" = 100)
);

CREATE TABLE "doctor_payout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"gross_amount" numeric(10, 2) NOT NULL,
	"adjustment_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(10, 2) NOT NULL,
	"transferred_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(3) DEFAULT 'MXN' NOT NULL,
	"status" "payout_status_enum" DEFAULT 'pending' NOT NULL,
	"stripe_transfer_id" varchar,
	"paid_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_payout_stripe_transfer_id_unique" UNIQUE("stripe_transfer_id"),
	CONSTRAINT "doctor_payout_period_chk" CHECK ("doctor_payout"."period_end" > "doctor_payout"."period_start"),
	CONSTRAINT "doctor_payout_net_chk" CHECK ("doctor_payout"."net_amount" = "doctor_payout"."gross_amount" + "doctor_payout"."adjustment_amount")
);

CREATE TABLE "doctor_payout_adjustment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"source_payout_id" uuid NOT NULL,
	"doctor_payout_item_id" uuid,
	"appointment_id" uuid,
	"payment_id" uuid,
	"type" "doctor_payout_adjustment_type_enum" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"reason" text NOT NULL,
	"created_by_type" "audit_actor_type_enum" NOT NULL,
	"created_by_user_id" uuid,
	"external_reference" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_payout_adjustment_amount_chk" CHECK ("doctor_payout_adjustment"."amount" <> 0),
	CONSTRAINT "doctor_payout_adjustment_creator_chk" CHECK (("doctor_payout_adjustment"."created_by_type" = 'user' and "doctor_payout_adjustment"."created_by_user_id" is not null) or ("doctor_payout_adjustment"."created_by_type" = 'system' and "doctor_payout_adjustment"."created_by_user_id" is null))
);

CREATE TABLE "doctor_payout_adjustment_application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adjustment_id" uuid NOT NULL,
	"applied_payout_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_payout_adjustment_application_amount_chk" CHECK ("doctor_payout_adjustment_application"."amount" <> 0)
);

CREATE TABLE "doctor_payout_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payout_id" uuid,
	"payment_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"eligible_at" timestamp with time zone NOT NULL,
	"eligibility_status" "doctor_payout_item_eligibility_enum" DEFAULT 'eligible' NOT NULL,
	"eligibility_revoked_at" timestamp with time zone,
	"eligibility_revoked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_payout_item_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "doctor_payout_item_revoked_chk" CHECK ("doctor_payout_item"."eligibility_status" <> 'revoked' or "doctor_payout_item"."eligibility_revoked_at" is not null)
);

ALTER TABLE "payment" ADD CONSTRAINT "payment_doctor_id_doctor_profile_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctor_profile"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "payment" ADD CONSTRAINT "payment_patient_id_patient_profile_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profile"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "payment" ADD CONSTRAINT "payment_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "payment" ADD CONSTRAINT "payment_medication_order_id_medication_order_id_fk" FOREIGN KEY ("medication_order_id") REFERENCES "public"."medication_order"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "refund" ADD CONSTRAINT "refund_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "refund" ADD CONSTRAINT "refund_requested_by_user_profile_id_user_profile_id_fk" FOREIGN KEY ("requested_by_user_profile_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "refund" ADD CONSTRAINT "refund_approved_by_user_profile_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "stripe_connect_account" ADD CONSTRAINT "stripe_connect_account_doctor_id_doctor_profile_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctor_profile"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "stripe_payment_method" ADD CONSTRAINT "stripe_payment_method_patient_id_patient_profile_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profile"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "consultation_commission_configuration" ADD CONSTRAINT "consultation_commission_configuration_created_by_user_profile_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "doctor_payout" ADD CONSTRAINT "doctor_payout_doctor_id_doctor_profile_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctor_profile"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "doctor_payout_adjustment" ADD CONSTRAINT "doctor_payout_adjustment_doctor_id_doctor_profile_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctor_profile"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "doctor_payout_adjustment" ADD CONSTRAINT "doctor_payout_adjustment_source_payout_id_doctor_payout_id_fk" FOREIGN KEY ("source_payout_id") REFERENCES "public"."doctor_payout"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "doctor_payout_adjustment" ADD CONSTRAINT "doctor_payout_adjustment_doctor_payout_item_id_doctor_payout_item_id_fk" FOREIGN KEY ("doctor_payout_item_id") REFERENCES "public"."doctor_payout_item"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "doctor_payout_adjustment" ADD CONSTRAINT "doctor_payout_adjustment_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "doctor_payout_adjustment" ADD CONSTRAINT "doctor_payout_adjustment_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "doctor_payout_adjustment" ADD CONSTRAINT "doctor_payout_adjustment_created_by_user_id_user_profile_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "doctor_payout_adjustment_application" ADD CONSTRAINT "doctor_payout_adjustment_application_adjustment_id_doctor_payout_adjustment_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."doctor_payout_adjustment"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "doctor_payout_adjustment_application" ADD CONSTRAINT "doctor_payout_adjustment_application_applied_payout_id_doctor_payout_id_fk" FOREIGN KEY ("applied_payout_id") REFERENCES "public"."doctor_payout"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "doctor_payout_item" ADD CONSTRAINT "doctor_payout_item_payout_id_doctor_payout_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."doctor_payout"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "doctor_payout_item" ADD CONSTRAINT "doctor_payout_item_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "payment_doctor_idx" ON "payment" USING btree ("doctor_id");
CREATE INDEX "payment_patient_idx" ON "payment" USING btree ("patient_id");
CREATE INDEX "payment_appointment_idx" ON "payment" USING btree ("appointment_id");
CREATE INDEX "payment_medication_order_idx" ON "payment" USING btree ("medication_order_id");
CREATE INDEX "payment_type_idx" ON "payment" USING btree ("type");
CREATE INDEX "payment_status_idx" ON "payment" USING btree ("status");
CREATE INDEX "payment_created_at_idx" ON "payment" USING btree ("created_at");
CREATE INDEX "refund_payment_idx" ON "refund" USING btree ("payment_id");
CREATE INDEX "refund_status_idx" ON "refund" USING btree ("status");
CREATE INDEX "refund_created_at_idx" ON "refund" USING btree ("created_at");
CREATE INDEX "stripe_payment_method_patient_idx" ON "stripe_payment_method" USING btree ("patient_id");
CREATE INDEX "stripe_payment_method_customer_idx" ON "stripe_payment_method" USING btree ("stripe_customer_id");
CREATE INDEX "stripe_webhook_type_idx" ON "stripe_webhook_event" USING btree ("event_type");
CREATE INDEX "stripe_webhook_status_idx" ON "stripe_webhook_event" USING btree ("status");
CREATE INDEX "stripe_webhook_received_idx" ON "stripe_webhook_event" USING btree ("received_at");
CREATE INDEX "commission_config_effective_from_idx" ON "consultation_commission_configuration" USING btree ("effective_from");
CREATE INDEX "doctor_payout_doctor_idx" ON "doctor_payout" USING btree ("doctor_id");
CREATE INDEX "doctor_payout_status_idx" ON "doctor_payout" USING btree ("status");
CREATE INDEX "doctor_payout_period_start_idx" ON "doctor_payout" USING btree ("period_start");
CREATE UNIQUE INDEX "doctor_payout_period_uq" ON "doctor_payout" USING btree ("doctor_id","period_start","period_end");
CREATE INDEX "doctor_payout_adjustment_doctor_idx" ON "doctor_payout_adjustment" USING btree ("doctor_id");
CREATE INDEX "doctor_payout_adjustment_source_idx" ON "doctor_payout_adjustment" USING btree ("source_payout_id");
CREATE INDEX "doctor_payout_adjustment_payment_idx" ON "doctor_payout_adjustment" USING btree ("payment_id");
CREATE INDEX "doctor_payout_adjustment_application_adjustment_idx" ON "doctor_payout_adjustment_application" USING btree ("adjustment_id");
CREATE INDEX "doctor_payout_adjustment_application_payout_idx" ON "doctor_payout_adjustment_application" USING btree ("applied_payout_id");
CREATE INDEX "doctor_payout_item_payout_idx" ON "doctor_payout_item" USING btree ("payout_id");
CREATE INDEX "doctor_payout_item_payment_idx" ON "doctor_payout_item" USING btree ("payment_id");
CREATE INDEX "doctor_payout_item_eligible_at_idx" ON "doctor_payout_item" USING btree ("eligible_at");
CREATE INDEX "doctor_payout_item_eligibility_idx" ON "doctor_payout_item" USING btree ("eligibility_status");

-- ---- Copia literal de 0001_triggers.sql (§6 a §8) ---------------------------------------------------------
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

-- ---- Copia literal de 0001_triggers.sql (§9, solo consultation_commission_configuration) --------------------
alter table consultation_commission_configuration
  add constraint commission_configuration_no_overlap
  exclude using gist (tstzrange(effective_from, effective_until) with &&);

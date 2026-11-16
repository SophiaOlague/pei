-- ============================================================================================================
-- Payments · Stripe como proveedor de pagos: agrega 'stripe' a payment_provider_enum
-- ------------------------------------------------------------------------------------------------------------
-- Fuente: docs/arquitectura/Payments-decisiones.md §8 (autorización de la responsable del producto, 2026-11-15).
--
-- Migración mínima: solo amplía el enum. No crea ni altera tablas, columnas, restricciones, índices ni triggers,
-- y no lee ni escribe datos. 'mercado_pago' se conserva (el historial y el código anterior siguen siendo válidos).
-- Requiere 0017 (payment_provider_enum). 0017 no se modifica.
--
-- Exige pei.migration_authorized = '0018' en la sesión (R-1): un comando genérico no puede aplicarla.
--
-- Reversión: PostgreSQL no permite retirar un valor de un enum. Mientras ninguna fila use 'stripe', el valor es
-- inocuo; retirarlo exigiría recrear el tipo y las cuatro columnas que lo usan, con una migración aprobada aparte.
-- ============================================================================================================

do $$
begin
  -- R-1: solo un ejecutor controlado autoriza 0018, en su sesión verificada y después de comprobar la huella completa
  -- del destino (scripts/migration-authorization.ts). Ni drizzle-kit ni otra herramienta definen esta variable.
  if coalesce(current_setting('pei.migration_authorized', true), '') <> '0018' then
    raise exception '0018 requiere autorización explícita de un ejecutor controlado (pei.migration_authorized). No se modificó nada'
      using errcode = 'P0001';
  end if;
  -- Un valor persistente (ALTER ROLE/DATABASE … SET) autorizaría cualquier sesión: no se admite.
  if exists (select 1 from pg_db_role_setting where array_to_string(setconfig, ',') like '%pei.migration_authorized%') then
    raise exception '0018 no admite una autorización persistente (ALTER ROLE/DATABASE … SET pei.migration_authorized)'
      using errcode = 'P0001';
  end if;
  if to_regtype('public.payment_provider_enum') is null or to_regclass('public.doctor_ledger_entry') is null then
    raise exception '0018 requiere 0017 (payment_provider_enum)' using errcode = 'P0001';
  end if;
  if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
              where t.oid = 'public.payment_provider_enum'::regtype and e.enumlabel = 'stripe') then
    raise exception '0018 ya está aplicada (payment_provider_enum contiene stripe)' using errcode = 'P0001';
  end if;
end $$;

alter type payment_provider_enum add value 'stripe';

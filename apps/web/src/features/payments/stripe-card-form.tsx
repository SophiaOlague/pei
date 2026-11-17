"use client";

import { useEffect, useRef, useState } from "react";
import type { CardPaymentInput } from "@/lib/api";
import {
  getStripe,
  type StripeCardElement,
  type StripeInstance,
} from "./stripe-sdk";

// Formulario de tarjeta con Stripe Elements. Stripe captura la tarjeta dentro de su propio iframe y la tokeniza: PEI
// nunca recibe el número ni el código de seguridad, solo la referencia del medio de pago (pm_…). El importe NO se
// envía: el backend cobra el precio registrado en la cita y descarta cualquier importe del cliente.

export function StripeCardForm({
  publishableKey,
  disabled = false,
  onSubmit,
}: {
  publishableKey: string;
  disabled?: boolean;
  onSubmit: (card: CardPaymentInput) => Promise<void>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<StripeInstance | null>(null);
  const cardRef = useRef<StripeCardElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [complete, setComplete] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Cada ejecución del efecto monta su propio elemento y solo desmonta ese (React Strict Mode monta dos veces en
  // desarrollo). Una ejecución cancelada nunca cambia el estado del componente.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let card: StripeCardElement | null = null;
    getStripe(publishableKey)
      .then((stripe) => {
        if (cancelled) return;
        card = stripe.elements({ locale: "es-419" }).create("card", {
          hidePostalCode: true,
          disableLink: true,
        });
        card.on("ready", () => {
          if (!cancelled) setStatus("ready");
        });
        card.on("change", (event) => {
          if (cancelled) return;
          setComplete(event.complete === true);
          setCardError(event.error?.message ?? null);
        });
        card.mount(host);
        stripeRef.current = stripe;
        cardRef.current = card;
      })
      // Sin registrar el detalle del error.
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      try {
        card?.unmount();
        card?.destroy?.();
      } catch {
        // El elemento de una ejecución cancelada no debe afectar a la vigente.
      }
      if (cardRef.current === card) cardRef.current = null;
    };
  }, [publishableKey]);

  async function pay() {
    const stripe = stripeRef.current;
    const card = cardRef.current;
    if (!stripe || !card || submitting) return;
    setSubmitting(true);
    setCardError(null);
    try {
      const result = await stripe.createPaymentMethod({ type: "card", card });
      if (result.error || !result.paymentMethod) {
        setCardError(
          result.error?.message ?? "Revisa los datos de tu tarjeta.",
        );
        return;
      }
      // Solo la referencia del medio de pago: ni importe ni datos de la tarjeta.
      await onSubmit({ token: result.paymentMethod.id });
    } catch {
      setCardError("No se pudo procesar la tarjeta. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {status === "loading" && (
        <output>Cargando el formulario de pago seguro…</output>
      )}
      {status === "error" && (
        <p role="alert">
          No se pudo cargar el formulario de pago. Recarga la página e inténtalo
          de nuevo.
        </p>
      )}
      <div
        ref={hostRef}
        data-testid="stripe-card-element"
        className={
          status === "error"
            ? "hidden"
            : "rounded-md border border-gray-300 bg-white p-3"
        }
      />
      {cardError && <p role="alert">{cardError}</p>}
      {status === "ready" && (
        <button
          type="button"
          onClick={pay}
          disabled={disabled || submitting || !complete}
          className="w-full rounded-md bg-blue-600 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Procesando…" : "Pagar"}
        </button>
      )}
    </div>
  );
}

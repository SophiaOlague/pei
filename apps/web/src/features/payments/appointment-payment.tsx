"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  type CardPaymentInput,
  getPatientAppointment,
  type PatientAppointment,
  type PatientPayment,
  payAppointment,
  syncAppointmentPayment,
} from "@/lib/api";
import { StripeCardForm } from "./stripe-card-form";
import { getStripe, stripePublishableKey } from "./stripe-sdk";

// Pago de una consulta con Stripe Elements. El cliente solo muestra el importe de la cita y entrega la referencia del
// medio de pago (pm_…); el backend valida paciente y cita (CC-4), toma el precio de la cita, aplica la idempotencia,
// cobra y confirma con M08.
//
// 3-D Secure: si el banco exige autenticación, el backend responde processing con nextAction. Stripe.js muestra el
// reto y, al terminar, se consulta el estado REAL en el backend. Completar el reto en el navegador nunca confirma la
// cita por sí mismo: solo la confirma el backend con el pago aprobado y verificado con Stripe.
//
// Clave de idempotencia: una por intención de pago y por cita. Se conserva entre reintentos (error de red o pago
// pendiente) y en sessionStorage para sobrevivir a una recarga. Solo se renueva después de un rechazo, para permitir
// otro intento con otra tarjeta. En sessionStorage NO se guarda ningún dato de la tarjeta, solo la clave.

export const idempotencyStorageKey = (appointmentId: string) =>
  `pei.payment.idempotency.${appointmentId}`;

function newKey(): string {
  return `pay-${crypto.randomUUID()}`;
}

function currentKey(appointmentId: string): string {
  const stored = sessionStorage.getItem(idempotencyStorageKey(appointmentId));
  if (stored) return stored;
  const key = newKey();
  sessionStorage.setItem(idempotencyStorageKey(appointmentId), key);
  return key;
}

function rotateKey(appointmentId: string): void {
  sessionStorage.setItem(idempotencyStorageKey(appointmentId), newKey());
}

const formatMxn = (amount: string) =>
  `$${Number(amount).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

export interface PaymentMessage {
  tone: "success" | "info" | "warning" | "error";
  title: string;
  detail: string;
  // Volver a mostrar el formulario (otro intento) o permitir consultar el estado.
  retry: boolean;
  sync: boolean;
}

// Qué ve el paciente. La cita solo se muestra confirmada si M08 respondió confirmed o already_confirmed.
export function paymentMessage(p: PatientPayment): PaymentMessage {
  if (p.status === "succeeded") {
    if (p.appointmentConfirmed) {
      return {
        tone: "success",
        title: "Pago aprobado: tu consulta está confirmada",
        detail: `Cobramos ${formatMxn(p.amount)}.`,
        retry: false,
        sync: false,
      };
    }
    if (p.confirmation.result === "not_confirmable") {
      return {
        tone: "warning",
        title: "Recibimos tu pago, pero no pudimos confirmar la consulta",
        detail:
          "Tu consulta NO está confirmada. Revisaremos tu caso; si corresponde, el importe se reembolsará.",
        retry: false,
        sync: false,
      };
    }
    return {
      tone: "info",
      title: "Recibimos tu pago; estamos confirmando tu consulta",
      detail:
        "Tu consulta todavía no está confirmada. Consulta el estado en unos momentos.",
      retry: false,
      sync: true,
    };
  }
  if (p.status === "processing") {
    return {
      tone: "info",
      title: "Tu pago se está procesando",
      detail:
        "Tu consulta todavía no está confirmada. Consulta el estado en unos momentos.",
      retry: false,
      sync: true,
    };
  }
  if (p.status === "pending") {
    return {
      tone: "warning",
      title: "Tu pago está pendiente",
      detail:
        "No recibimos la respuesta del procesador. Puedes reintentar: no se te cobrará dos veces.",
      retry: true,
      sync: false,
    };
  }
  if (p.status === "failed") {
    return {
      tone: "error",
      title: "Tu pago fue rechazado",
      detail: "No se realizó ningún cargo. Puedes intentar con otra tarjeta.",
      retry: true,
      sync: false,
    };
  }
  if (p.status === "canceled") {
    return {
      tone: "error",
      title: "El pago fue cancelado",
      detail: "No se realizó ningún cargo.",
      retry: true,
      sync: false,
    };
  }
  return {
    tone: "warning",
    title: "El pago requiere revisión",
    detail: "Tu consulta no está confirmada. Contacta a soporte.",
    retry: false,
    sync: false,
  };
}

const TONE: Record<PaymentMessage["tone"], string> = {
  success: "border-green-300 bg-green-50 text-green-800",
  info: "border-blue-300 bg-blue-50 text-blue-800",
  warning: "border-amber-300 bg-amber-50 text-amber-800",
  error: "border-red-300 bg-red-50 text-red-800",
};

export function AppointmentPayment({
  appointmentId,
}: {
  appointmentId: string;
}) {
  const publicKey = stripePublishableKey();
  const [appointment, setAppointment] = useState<PatientAppointment | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [payment, setPayment] = useState<PatientPayment | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Cada intento nuevo vuelve a montar el formulario (la referencia de la tarjeta es de un solo uso).
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    getPatientAppointment(appointmentId)
      .then(setAppointment)
      .catch((e: unknown) =>
        setLoadError(
          e instanceof ApiError ? e.message : "No se pudo cargar la cita.",
        ),
      );
  }, [appointmentId]);

  // Autenticación 3-D Secure, si el pago la requiere. Pase lo que pase en el reto (aprobado, rechazado o cerrado), el
  // resultado que se muestra es el que informa el backend tras consultar a Stripe.
  const authenticate = useCallback(
    async (result: PatientPayment): Promise<PatientPayment> => {
      if (!publicKey || result.status !== "processing" || !result.nextAction)
        return result;
      try {
        const stripe = await getStripe(publicKey);
        await stripe.handleNextAction({
          clientSecret: result.nextAction.clientSecret,
        });
      } catch {
        // Sin registrar el detalle: el estado real se consulta a continuación.
      }
      try {
        return await syncAppointmentPayment(result.paymentId);
      } catch {
        // No se pudo consultar ahora: el paciente puede hacerlo con «Consultar estado del pago».
        return { ...result, nextAction: undefined };
      }
    },
    [publicKey],
  );

  const submit = useCallback(
    async (card: CardPaymentInput) => {
      setBusy(true);
      setRequestError(null);
      try {
        const result = await payAppointment(
          appointmentId,
          currentKey(appointmentId),
          card,
        );
        const settled = await authenticate(result);
        setPayment(settled);
        if (settled.status === "failed" || settled.status === "canceled")
          rotateKey(appointmentId);
      } catch (e) {
        // Error de red o del servidor: se conserva la clave para reintentar sin duplicar el cobro.
        setRequestError(
          e instanceof ApiError
            ? e.message
            : "No se pudo completar el pago. Inténtalo de nuevo.",
        );
      } finally {
        setBusy(false);
      }
    },
    [appointmentId, authenticate],
  );

  const sync = useCallback(async () => {
    if (!payment) return;
    setBusy(true);
    setRequestError(null);
    try {
      setPayment(await syncAppointmentPayment(payment.paymentId));
    } catch (e) {
      setRequestError(
        e instanceof ApiError
          ? e.message
          : "No se pudo consultar el estado del pago.",
      );
    } finally {
      setBusy(false);
    }
  }, [payment]);

  if (!publicKey) {
    return (
      <p role="alert">
        El pago con tarjeta no está disponible en este momento.
      </p>
    );
  }
  if (loadError) return <p role="alert">{loadError}</p>;
  if (!appointment) return <output>Cargando tu cita…</output>;

  const message = payment ? paymentMessage(payment) : null;
  const payable = appointment.status === "pending_payment";
  const showBrick = payable && (!message || message.retry);

  return (
    <section className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold text-gray-900">
        Pago de la consulta
      </h1>
      <output
        aria-label="Importe de la consulta"
        className="block text-lg text-gray-800"
      >
        {formatMxn(appointment.price)}
      </output>

      {message && (
        <output
          aria-live="polite"
          className={`block rounded-lg border p-4 ${TONE[message.tone]}`}
        >
          <p className="font-semibold">{message.title}</p>
          <p>{message.detail}</p>
          {message.sync && (
            <button
              type="button"
              onClick={sync}
              disabled={busy}
              className="mt-3 rounded-md border px-4 py-2"
            >
              Consultar estado del pago
            </button>
          )}
        </output>
      )}

      {requestError && <p role="alert">{requestError}</p>}

      {!payable && !payment && (
        <p role="alert">
          Esta cita ya no admite pago. Si la retención venció, vuelve a reservar
          el horario.
        </p>
      )}

      {showBrick && (
        <StripeCardForm
          key={attempt}
          publishableKey={publicKey}
          disabled={busy}
          onSubmit={async (card) => {
            await submit(card);
            setAttempt((n) => n + 1);
          }}
        />
      )}
    </section>
  );
}

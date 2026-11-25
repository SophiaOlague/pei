import * as SecureStore from "expo-secure-store";
import { type MutableRefObject, useEffect, useState } from "react";

import {
  ApiError,
  getBookableDoctors,
  getPatientAppointment,
  type PatientAppointment,
  type PatientPayment,
  syncAppointmentPayment,
} from "@/lib/api";

// Finalización del pago de una consulta (pago.tsx). El estado del pago y de la cita siempre lo informa el backend:
// nada de lo que hay aquí confirma una cita ni crea un cobro.

// Último pago iniciado para la cita (solo su id, nunca datos de la tarjeta). Al volver a abrir la pantalla se consulta su
// estado real con el backend en lugar de cobrar otra vez.
export const lastPaymentStorageKey = (appointmentId: string) =>
  `pei.payment.last.${appointmentId}`;

// Mientras el pago se procesa o la cita se confirma, se consulta el backend (sync) cada POLL_MS, hasta POLL_LIMIT veces.
export const POLL_MS = 4000;
export const POLL_LIMIT = 15;

export function rememberPayment(
  appointmentId: string,
  paymentId: string
): Promise<void> {
  return SecureStore.setItemAsync(
    lastPaymentStorageKey(appointmentId),
    paymentId
  ).catch(() => undefined);
}

async function resumedPayment(
  appointmentId: string
): Promise<PatientPayment | null> {
  const last = await SecureStore.getItemAsync(
    lastPaymentStorageKey(appointmentId)
  ).catch(() => null);
  return last ? syncAppointmentPayment(last).catch(() => null) : null;
}

type Loaded =
  | { appointment: PatientAppointment; resumed: PatientPayment | null }
  | { error: string };

async function loadForPayment(appointmentId: string): Promise<Loaded> {
  let appointment: PatientAppointment;
  try {
    appointment = await getPatientAppointment(appointmentId);
  } catch (e) {
    return {
      error: e instanceof ApiError ? e.message : "No se pudo cargar la cita.",
    };
  }
  const resumed =
    appointment.status === "pending_payment"
      ? await resumedPayment(appointmentId)
      : null;
  return { appointment, resumed };
}

// Carga la cita y, si sigue pendiente de pago con un pago ya iniciado, retoma su estado real (sync).
export function useAppointmentForPayment(
  appointmentId: string,
  onResumed: (payment: PatientPayment) => void
) {
  const [appointment, setAppointment] = useState<PatientAppointment | null>(
    null
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadForPayment(appointmentId).then((loaded) => {
      if (cancelled) {
        return;
      }
      if ("error" in loaded) {
        setLoadError(loaded.error);
        return;
      }
      setAppointment(loaded.appointment);
      if (loaded.resumed) {
        onResumed(loaded.resumed);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [appointmentId, onResumed]);

  return { appointment, loadError };
}

// Nombre del médico, del catálogo de médicos reservables (como en la próxima cita). Si no está, no se muestra.
export function useDoctorName(doctorProfileId: string | undefined) {
  const [doctorName, setDoctorName] = useState<string | null>(null);
  useEffect(() => {
    if (!doctorProfileId) {
      return;
    }
    let cancelled = false;
    getBookableDoctors()
      .then((doctors) => {
        const found = doctors.find(
          (d) => d.doctorProfileId === doctorProfileId
        );
        if (!cancelled) {
          setDoctorName(found?.displayName ?? null);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [doctorProfileId]);
  return doctorName;
}

// Estado de espera: consulta el backend (el mismo sync del botón) hasta un estado definitivo o agotar los intentos.
export function usePaymentPolling(
  paymentId: string | undefined,
  waiting: boolean,
  polls: MutableRefObject<number>,
  onUpdate: (payment: PatientPayment) => void
) {
  useEffect(() => {
    if (!(waiting && paymentId)) {
      return;
    }
    const timer = setInterval(async () => {
      if (polls.current >= POLL_LIMIT) {
        clearInterval(timer);
        return;
      }
      polls.current += 1;
      try {
        onUpdate(await syncAppointmentPayment(paymentId));
      } catch {
        // Se reintenta en el siguiente ciclo o con el botón.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, paymentId, polls, onUpdate]);
}

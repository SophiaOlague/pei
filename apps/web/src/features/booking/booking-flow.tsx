"use client";

import { CalendarCheck, Lock, UserCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PatientNav } from "@/features/components/patient-nav";
import { REVIEW_LEGAL_PATH } from "@/features/components/require-registration";
import {
  IDENTITY_REQUIREMENT_MESSAGE,
  IdentityRequirementNotice,
} from "@/features/identity-verification/identity-requirement-notice";
import {
  APPOINTMENT_REASON_MAX,
  ApiError,
  type BookableDoctor,
  type DoctorSlot,
  getBookableDoctors,
  getDoctorSlots,
  getRegistrationStatus,
  holdAppointment,
  type IdentityRequirement,
  identityRequirementIn,
  identityRequirementOf,
} from "@/lib/api";
import {
  bookingPathFor,
  MY_APPOINTMENTS_PATH,
  paymentPath,
  validDoctorProfileId,
} from "./paths";
import { dateChip, formatSlotDate, slotRange } from "./schedule";

// Agendamiento real (M08), equivalente al flujo móvil seleccioncita → seleccionfecha → pago:
//   1. GET /doctors/bookable: médicos que pueden operar y tienen horarios (con su doctorProfileId real).
//   2. GET /doctors/:id/slots: horarios libres de los próximos 14 días (M07).
//   3. POST /me/patient/appointments: cita pending_payment con retención; el backend valida horario, retención única,
//      registro e identidad, y fija el precio. Solo con la cita creada se navega a /pagar-cita/:appointmentId.
// La interfaz no decide si se puede reservar: GET /me/registration-status solo anticipa el requisito de identidad
// (y evita una petición que el backend rechazaría); la decisión final es la respuesta del POST.
//
// Reintentos sin duplicar: mientras la petición está en curso el botón no responde; si la red falla, el reintento es la
// MISMA petición y el backend devuelve la misma retención (RB-2); una cita ya creada para ese horario se reutiliza.

type Registration =
  | { kind: "loading" }
  | {
      kind: "known";
      canBook: boolean;
      requirement: IdentityRequirement | null;
      // RN-140: falta aceptar la versión vigente de los documentos legales.
      legalPending?: boolean;
    }
  // No se pudo consultar: no se supone ningún requisito; el backend decide al reservar.
  | { kind: "unknown" };

type HoldError =
  | { kind: "message"; message: string }
  | { kind: "identity"; requirement: IdentityRequirement }
  | { kind: "active_hold"; message: string };

const NETWORK_MESSAGE =
  "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo; no se duplicará tu reserva.";

const sectionTitle =
  "text-black text-xl sm:text-2xl md:text-[28px] font-medium leading-tight";
const chipClass = (selected: boolean) =>
  `flex-shrink-0 rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer border-2 disabled:opacity-50 disabled:cursor-not-allowed ${
    selected
      ? "bg-[#664BDB] text-white border-[#664BDB]"
      : "bg-white text-[#664BDB] border-[#664BDB]/40 hover:border-[#664BDB]"
  }`;

export function BookingFlow({
  initialDoctorId = null,
}: {
  initialDoctorId?: string | null;
}) {
  const router = useRouter();
  const [registration, setRegistration] = useState<Registration>({
    kind: "loading",
  });
  const [doctors, setDoctors] = useState<BookableDoctor[] | null>(null);
  const [doctorsError, setDoctorsError] = useState("");
  const [doctorId, setDoctorId] = useState<string | null>(
    validDoctorProfileId(initialDoctorId),
  );
  const [slots, setSlots] = useState<DoctorSlot[] | null>(null);
  const [slotsError, setSlotsError] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [holding, setHolding] = useState(false);
  const [holdError, setHoldError] = useState<HoldError | null>(null);
  // Cita ya creada por médico y horario: un segundo intento no vuelve a reservar.
  const created = useRef(new Map<string, string>());
  // Bloqueo síncrono: dos clics antes del re-render no envían dos reservas.
  const inFlight = useRef(false);

  const handleAuthError = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return true;
      }
      return false;
    },
    [router],
  );

  // Estado real del registro: se consulta al entrar (también al volver de la verificación de identidad).
  useEffect(() => {
    let active = true;
    getRegistrationStatus()
      .then((status) => {
        if (!active) return;
        setRegistration({
          kind: "known",
          canBook: status.canBookAppointments,
          requirement: identityRequirementIn(status.missing),
          legalPending: status.missing.includes("legal"),
        });
      })
      .catch((error: unknown) => {
        if (!active || handleAuthError(error)) return;
        setRegistration({ kind: "unknown" });
      });
    return () => {
      active = false;
    };
  }, [handleAuthError]);

  const loadDoctors = useCallback(async () => {
    setDoctorsError("");
    setDoctors(null);
    try {
      setDoctors(await getBookableDoctors());
    } catch (error) {
      if (handleAuthError(error)) return;
      setDoctorsError(
        error instanceof ApiError
          ? error.message
          : "No se pudieron cargar los médicos.",
      );
    }
  }, [handleAuthError]);

  useEffect(() => {
    loadDoctors();
  }, [loadDoctors]);

  const doctor = useMemo(
    () => doctors?.find((d) => d.doctorProfileId === doctorId) ?? null,
    [doctors, doctorId],
  );
  // Un médico del contexto que ya no es reservable no se muestra como elegido.
  const staleDoctor = doctors !== null && doctorId !== null && !doctor;

  const loadSlots = useCallback(
    async (id: string) => {
      setSlotsError("");
      setSlots(null);
      setSelectedDate(null);
      setSelectedSlot(null);
      const { from, to } = slotRange();
      try {
        const view = await getDoctorSlots(id, from, to);
        setSlots(view.slots);
        setSelectedDate(view.slots[0]?.date ?? null);
      } catch (error) {
        if (handleAuthError(error)) return;
        setSlotsError(
          error instanceof ApiError
            ? error.message
            : "No se pudieron cargar los horarios.",
        );
      }
    },
    [handleAuthError],
  );

  const doctorProfileId = doctor?.doctorProfileId ?? null;
  useEffect(() => {
    if (doctorProfileId) loadSlots(doctorProfileId);
  }, [doctorProfileId, loadSlots]);

  const chooseDoctor = (id: string) => {
    if (holding || id === doctorId) return;
    setHoldError(null);
    setDoctorId(id);
    // El médico elegido queda en la URL: es el contexto para regresar desde la verificación de identidad.
    router.replace(bookingPathFor(id), { scroll: false });
  };

  const dates = useMemo(
    () => [...new Set((slots ?? []).map((s) => s.date))],
    [slots],
  );
  const daySlots = useMemo(
    () => (slots ?? []).filter((s) => s.date === selectedDate),
    [slots, selectedDate],
  );

  const requirement =
    holdError?.kind === "identity"
      ? holdError.requirement
      : registration.kind === "known"
        ? registration.requirement
        : null;
  // Solo se bloquea cuando el backend ya informó que no se puede reservar.
  const blocked = registration.kind === "known" && !registration.canBook;
  const trimmed = reason.trim();

  const reserve = async () => {
    if (!(doctorProfileId && selectedSlot) || blocked || inFlight.current)
      return;
    if (!trimmed) {
      setHoldError({
        kind: "message",
        message: "Escribe el motivo de la consulta.",
      });
      return;
    }
    const key = `${doctorProfileId}|${selectedSlot}`;
    const existing = created.current.get(key);
    if (existing) {
      router.push(paymentPath(existing));
      return;
    }
    inFlight.current = true;
    setHolding(true);
    setHoldError(null);
    try {
      const appointment = await holdAppointment({
        doctorProfileId,
        startsAt: selectedSlot,
        reason: trimmed,
      });
      if (!appointment?.id || appointment.status !== "pending_payment") {
        setHoldError({
          kind: "message",
          message: "No se pudo reservar el horario. Inténtalo de nuevo.",
        });
        return;
      }
      created.current.set(key, appointment.id);
      router.push(paymentPath(appointment.id));
    } catch (error) {
      if (handleAuthError(error)) return;
      const identity = identityRequirementOf(error);
      if (identity) {
        setHoldError({ kind: "identity", requirement: identity });
        setRegistration((prev) =>
          prev.kind === "known"
            ? { ...prev, canBook: false, requirement: identity }
            : { kind: "known", canBook: false, requirement: identity },
        );
        return;
      }
      // RN-140: la API rechaza la reserva si falta la aceptación legal vigente (missing incluye legal).
      if (
        error instanceof ApiError &&
        error.error === "RegistrationIncompleteError" &&
        error.missing.includes("legal")
      ) {
        setHoldError(null);
        setRegistration({
          kind: "known",
          canBook: false,
          requirement: null,
          legalPending: true,
        });
        return;
      }
      if (!(error instanceof ApiError)) {
        setHoldError({
          kind: "message",
          message: "No se pudo reservar el horario. Inténtalo de nuevo.",
        });
        return;
      }
      if (error.status === 0) {
        setHoldError({ kind: "message", message: NETWORK_MESSAGE });
        return;
      }
      if (error.error === "ActiveHoldExistsError") {
        // En la web no se libera una retención (podría tener un pago en curso): se paga o se espera a que venza.
        setHoldError({
          kind: "active_hold",
          message:
            "Ya tienes un horario apartado pendiente de pago. Complétalo desde tus citas o espera a que venza",
        });
        return;
      }
      setHoldError({ kind: "message", message: error.message });
      // El horario dejó de estar disponible: se vuelven a pedir los horarios reales.
      if (
        error.error === "SlotUnavailableError" ||
        error.error === "InvalidSlotError"
      )
        loadSlots(doctorProfileId);
    } finally {
      inFlight.current = false;
      setHolding(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <PatientNav />
      <main className="px-4 sm:px-8 max-w-[1100px] mx-auto mt-6 sm:mt-10 pb-16">
        <h1 className="text-black text-[32px] sm:text-[44px] lg:text-[60px] font-medium leading-tight">
          Agenda tu cita
        </h1>
        <p className="text-[#717171] text-[16px] sm:text-[20px] lg:text-[24px] mt-2">
          Elige a tu médico, la fecha y el horario de tu consulta en línea.
        </p>

        {requirement && (
          <IdentityRequirementNotice
            requirement={requirement}
            doctorProfileId={doctorProfileId}
          />
        )}
        {blocked && !requirement && (
          <p
            role="alert"
            className="mt-6 bg-[#F5F5F5] rounded-2xl p-4 sm:p-6 text-[#535353] text-[16px]"
          >
            {registration.kind === "known" && registration.legalPending ? (
              <>
                Para agendar necesitas aceptar la versión vigente de los
                documentos legales.{" "}
                <Link
                  href={REVIEW_LEGAL_PATH}
                  className="text-[#7355F7] font-semibold"
                >
                  Revisar y aceptar
                </Link>
              </>
            ) : (
              "Tu registro tiene requisitos pendientes; todavía no puedes agendar consultas."
            )}
          </p>
        )}

        <section aria-label="Elige a tu médico" className="mt-10">
          <h2 className={sectionTitle}>1. Elige a tu médico</h2>
          {doctorsError ? (
            <div className="mt-4 bg-[#F5F5F5] rounded-2xl p-6">
              <p role="alert" className="text-[#E23A5C] text-[16px]">
                {doctorsError}
              </p>
              <button
                type="button"
                onClick={loadDoctors}
                className="mt-4 h-[44px] px-5 border-2 border-[#7355F7] rounded-lg text-[#7355F7] hover:bg-[#F5F2FF] transition"
              >
                Reintentar
              </button>
            </div>
          ) : doctors === null ? (
            <output className="block mt-4 text-[#717171] text-[16px]">
              Cargando médicos…
            </output>
          ) : doctors.length === 0 ? (
            <p className="mt-4 bg-[#F5F5F5] rounded-2xl p-6 text-[#535353] text-[16px]">
              No hay médicos con horarios disponibles por ahora.
            </p>
          ) : (
            <ul className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {doctors.map((d) => {
                const selected = d.doctorProfileId === doctorProfileId;
                return (
                  <li key={d.doctorProfileId}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => chooseDoctor(d.doctorProfileId)}
                      disabled={holding}
                      className={`w-full text-left rounded-2xl p-5 flex items-center gap-4 transition cursor-pointer border-2 disabled:opacity-60 ${
                        selected
                          ? "bg-[#E3DDFD] border-[#7355F7]"
                          : "bg-[#EDEDED] border-transparent hover:border-[#AB99FA]"
                      }`}
                    >
                      <UserCircle
                        className="w-14 h-14 text-[#AB99FA] flex-shrink-0"
                        strokeWidth={1.25}
                        aria-hidden="true"
                      />
                      <span>
                        <span className="block text-black text-[18px] sm:text-[20px]">
                          {d.displayName}
                        </span>
                        <span className="block text-[#2F2F2F] text-[15px] mt-1">
                          {d.specialty.name}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {staleDoctor && (
            <p className="mt-4 text-[#535353] text-[15px]">
              El médico que elegiste ya no tiene horarios disponibles. Elige
              otro médico.
            </p>
          )}
        </section>

        {doctor && (
          <section aria-label="Elige fecha y horario" className="mt-10">
            <h2 className={sectionTitle}>2. Elige fecha y horario</h2>
            <p className="text-[#717171] text-[16px] mt-1">
              {doctor.displayName} · {doctor.specialty.name}
            </p>

            {slotsError ? (
              <div className="mt-4 bg-[#F5F5F5] rounded-2xl p-6">
                <p role="alert" className="text-[#E23A5C] text-[16px]">
                  {slotsError}
                </p>
                <button
                  type="button"
                  onClick={() => loadSlots(doctor.doctorProfileId)}
                  className="mt-4 h-[44px] px-5 border-2 border-[#7355F7] rounded-lg text-[#7355F7] hover:bg-[#F5F2FF] transition"
                >
                  Reintentar
                </button>
              </div>
            ) : slots === null ? (
              <output className="block mt-4 text-[#717171] text-[16px]">
                Cargando horarios…
              </output>
            ) : slots.length === 0 ? (
              <p className="mt-4 bg-[#F5F5F5] rounded-2xl p-6 text-[#535353] text-[16px]">
                Este médico no tiene horarios disponibles en los próximos días.
              </p>
            ) : (
              <>
                <p className="block text-black text-[16px] font-medium mt-6 mb-2">
                  Fechas disponibles
                </p>
                <div className="flex gap-3 overflow-x-auto pb-3 minimal-scroll">
                  {dates.map((date) => {
                    const chip = dateChip(date);
                    return (
                      <button
                        key={date}
                        type="button"
                        aria-label={`Fecha ${formatSlotDate(date)}`}
                        aria-pressed={selectedDate === date}
                        disabled={holding}
                        onClick={() => {
                          setSelectedDate(date);
                          setSelectedSlot(null);
                        }}
                        className={`w-[62px] h-[62px] ${chipClass(selectedDate === date)}`}
                      >
                        <span className="text-[18px] font-semibold leading-none">
                          {chip.day}
                        </span>
                        <span className="text-[14px] mt-1 leading-none">
                          {chip.month}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <p className="block text-black text-[16px] font-medium mt-4 mb-2">
                  Horarios disponibles
                </p>
                <div className="flex gap-3 overflow-x-auto pb-3 minimal-scroll">
                  {daySlots.map((slot) => (
                    <button
                      key={slot.startsAt}
                      type="button"
                      aria-label={`Horario ${slot.start}`}
                      aria-pressed={selectedSlot === slot.startsAt}
                      disabled={holding}
                      onClick={() => setSelectedSlot(slot.startsAt)}
                      className={`w-[74px] h-[52px] text-[16px] ${chipClass(selectedSlot === slot.startsAt)}`}
                    >
                      {slot.start}
                    </button>
                  ))}
                </div>
              </>
            )}

            <label
              htmlFor="motivo-consulta"
              className="block text-black text-[16px] font-medium mt-6 mb-2"
            >
              Motivo de la consulta
            </label>
            <textarea
              id="motivo-consulta"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={APPOINTMENT_REASON_MAX}
              rows={3}
              placeholder="Describe brevemente el motivo"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#664BDB] transition-colors"
            />
            <p className="text-[13px] text-[#999999] mt-1">
              {trimmed.length}/{APPOINTMENT_REASON_MAX} caracteres
            </p>

            <div className="mt-6 bg-[#F5F5F5] rounded-2xl p-5 sm:p-6">
              <p className="text-[#535353] text-[15px] flex items-center gap-2">
                <CalendarCheck
                  className="w-5 h-5 text-[#7355F7]"
                  aria-hidden="true"
                />
                El importe se confirma con la reserva y se cobra en el siguiente
                paso. Tu horario queda apartado unos minutos mientras pagas.
              </p>
              {holdError?.kind === "message" && (
                <p role="alert" className="text-[#E23A5C] text-[15px] mt-3">
                  {holdError.message}
                </p>
              )}
              {holdError?.kind === "identity" && (
                <p role="alert" className="text-[#E23A5C] text-[15px] mt-3">
                  {IDENTITY_REQUIREMENT_MESSAGE[holdError.requirement]}
                </p>
              )}
              {holdError?.kind === "active_hold" && (
                <p role="alert" className="text-[#E23A5C] text-[15px] mt-3">
                  {holdError.message}.{" "}
                  <Link
                    href={MY_APPOINTMENTS_PATH}
                    className="text-[#7355F7] font-medium hover:underline"
                  >
                    Ver mis citas
                  </Link>
                </p>
              )}
              <button
                type="button"
                onClick={reserve}
                disabled={!selectedSlot || holding || blocked}
                className="w-full sm:w-auto mt-4 h-[54px] px-8 rounded-lg bg-[#664BDB] text-white font-medium text-[16px] sm:text-[18px] hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {holding ? "Reservando…" : "Reservar y continuar al pago"}
              </button>
              <p className="text-gray-500 text-[13px] mt-3 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                Pago seguro
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

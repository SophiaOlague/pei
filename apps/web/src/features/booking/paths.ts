// Rutas del agendamiento de consultas (web).
export const BOOKING_PATH = "/agendar-cita";
export const MY_APPOINTMENTS_PATH = "/mis-citas";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Solo un identificador con forma de UUID se acepta como contexto (de la URL o de otra pantalla).
export const validDoctorProfileId = (value: unknown): string | null =>
  typeof value === "string" && UUID.test(value) ? value : null;

// Agendamiento con el médico ya elegido (contexto para regresar desde la verificación de identidad).
export function bookingPathFor(doctorProfileId?: string | null): string {
  const id = validDoctorProfileId(doctorProfileId);
  return id ? `${BOOKING_PATH}?medico=${encodeURIComponent(id)}` : BOOKING_PATH;
}

// F4: pago de la cita creada por el backend.
export const paymentPath = (appointmentId: string) =>
  `/pagar-cita/${encodeURIComponent(appointmentId)}`;

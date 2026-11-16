import { validDoctorProfileId } from "@/features/booking/paths";

// Verificación de identidad del paciente (web). `origen=reserva`: se llegó desde el requisito de una reserva;
// `medico`: el médico que se estaba agendando, para volver a él.
export const IDENTITY_VERIFICATION_PATH = "/verificacion-identidad";

export function identityFromBookingPath(doctorProfileId?: string | null) {
  const params = new URLSearchParams({ origen: "reserva" });
  const id = validDoctorProfileId(doctorProfileId);
  if (id) params.set("medico", id);
  return `${IDENTITY_VERIFICATION_PATH}?${params.toString()}`;
}

export const IDENTITY_VERIFICATION_FROM_BOOKING_PATH =
  identityFromBookingPath();

export { BOOKING_PATH, bookingPathFor } from "@/features/booking/paths";

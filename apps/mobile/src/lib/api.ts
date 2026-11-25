// Cliente de los endpoints REST del backend de PEI (fuera de Better Auth). En móvil no hay cookies del
// navegador: la cookie de sesión vive en SecureStore (expoClient) y se envía a mano en el encabezado Cookie.
// El backend la valida en cada petición (SessionGuard). Contratos en apps/backend:
//   GET  /legal-documents/current?audience=patient  (legal-documents.controller.ts)
//   GET  /me/registration-status                    (me.controller.ts, registration-status.ts)
//   POST /me/patient-profile                        (RegisterPatientProfileDto)
//   POST /me/legal-acceptances                      (AcceptLegalDocumentsDto)
//   GET  /me/identity-verification                  (estado del último envío del INE, sin documentos)
//   POST /me/identity-verification                  (multipart: front y back; JPEG o PNG de máximo 5 MB)
import { authClient } from "@/lib/auth-client";
import { API_URL } from "@/lib/config";

export type LegalDocumentType =
  | "privacy_notice"
  | "terms_and_conditions"
  | "privacy_policy"
  | "patient_terms"
  | "doctor_terms";

export type LegalDocument = {
  id: string;
  type: LegalDocumentType;
  version: string;
  publishedAt: string;
  content: string;
};

export type PendingLegalDocument = {
  type: LegalDocumentType;
  documentId: string;
  version: string;
};

export type MissingRequirement =
  | "profile"
  | "legal"
  | "identity_submission"
  | "identity_review"
  | "identity_resubmission";

export type IdentityVerificationStatus =
  | "not_submitted"
  | "pending"
  | "rejected"
  | "approved";

export type RegistrationStatus = {
  profileCompleted: boolean;
  // reacceptanceRequired (D-37, RN-140): ya completó su registro y solo falta aceptar una versión nueva. Lo decide el
  // backend con las aceptaciones guardadas; un backend que no lo envíe se trata como primer registro (bloquea).
  legal: {
    accepted: boolean;
    pending: PendingLegalDocument[];
    reacceptanceRequired?: boolean;
  };
  identity: {
    status: IdentityVerificationStatus;
    rejectionReason: string | null;
  };
  registrationComplete: boolean;
  canBookAppointments: boolean;
  missing: MissingRequirement[];
};

export type PatientProfileInput = {
  firstName: string;
  lastName: string;
  curp: string;
  birthDate: string; // AAAA-MM-DD
};

// status 0: la petición no llegó al servidor. error: nombre del error de dominio (DomainExceptionFilter).
// missing: requisitos que faltan según el backend (details.missing de RegistrationIncompleteError); vacío si no aplica.
export class ApiError extends Error {
  readonly status: number;
  readonly error?: string;
  readonly missing: readonly string[];

  constructor(
    status: number,
    message: string,
    error?: string,
    options?: ErrorOptions,
    missing: readonly string[] = []
  ) {
    super(message, options);
    this.name = "ApiError";
    this.status = status;
    this.error = error;
    this.missing = missing;
  }
}

type ErrorBody = {
  message?: string | string[];
  error?: string;
  details?: { missing?: unknown };
};

function missingFrom(body: ErrorBody | null): string[] {
  const missing = body?.details?.missing;
  return Array.isArray(missing)
    ? missing.filter((m): m is string => typeof m === "string")
    : [];
}

// Mensajes del backend que se pueden mostrar tal cual: los de dominio están redactados para la persona
// y no repiten datos enviados (p. ej., la CURP). Los de class-validator (arreglo) no: se resumen.
function messageFor(status: number, body: ErrorBody | null): string {
  if (status === 401) {
    return "Tu sesión expiró. Inicia sesión de nuevo.";
  }
  if (status === 429) {
    return "Demasiados intentos. Espera unos minutos e intenta de nuevo.";
  }
  if (status >= 500) {
    return "El servidor no pudo completar la operación. Intenta de nuevo.";
  }
  const message = body?.message;
  if (Array.isArray(message) || !message) {
    return "Revisa los datos e intenta de nuevo.";
  }
  return message;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const cookie = await authClient.getCookie();
  // Multipart: fetch define el Content-Type con su boundary; no se fuerza JSON.
  const multipart =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "omit",
      headers: {
        ...(multipart ? {} : { "Content-Type": "application/json" }),
        ...(cookie ? { Cookie: cookie } : {}),
        ...init?.headers,
      },
    });
  } catch (cause) {
    throw new ApiError(
      0,
      "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.",
      undefined,
      { cause }
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    throw new ApiError(
      response.status,
      messageFor(response.status, body),
      body?.error,
      undefined,
      missingFrom(body)
    );
  }
  return (await response.json()) as T;
}

export function getRegistrationStatus(): Promise<RegistrationStatus> {
  return request("/me/registration-status");
}

export function getCurrentLegalDocuments(): Promise<LegalDocument[]> {
  return request("/legal-documents/current?audience=patient");
}

export function createPatientProfile(
  input: PatientProfileInput
): Promise<{ patientProfileId: string; userProfileId: string }> {
  return request("/me/patient-profile", {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export function acceptLegalDocuments(documentIds: string[]): Promise<{
  accepted: { documentId: string; type: string; version: string }[];
}> {
  return request("/me/legal-acceptances", {
    body: JSON.stringify({ documentIds }),
    method: "POST",
  });
}

// GET /me/profile (GetPatientProfileUseCase). Sin sesión → 401; sin rol de paciente o sin perfil → 403
// PatientProfileRequiredError. Incluye la CURP: no se muestra ni se registra.
export type PatientProfile = {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  curp: string;
  phone: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  hasPhoto: boolean;
};

export function getProfile(): Promise<PatientProfile> {
  return request("/me/profile");
}

// PATCH /me/profile (UpdatePatientProfileDto, DP-12): solo estos cuatro campos. El backend recorta cada valor y exige
// de 1 al máximo de caracteres; null borra el valor. Cualquier otro campo (nombre, fecha, CURP) responde 400.
export type EditableProfileField =
  | "phone"
  | "address"
  | "emergencyContactName"
  | "emergencyContactPhone";

export const EDITABLE_PROFILE_LIMITS: Record<EditableProfileField, number> = {
  address: 300,
  emergencyContactName: 100,
  emergencyContactPhone: 30,
  phone: 30,
};

export const EDITABLE_PROFILE_FIELDS = Object.keys(
  EDITABLE_PROFILE_LIMITS
) as EditableProfileField[];

export type EditableProfileDraft = Record<EditableProfileField, string>;
export type EditableProfilePatch = Partial<
  Record<EditableProfileField, string | null>
>;

// Texto recortado; vacío → null (el backend rechaza "" y usa null para borrar).
function normalizeEditable(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

// Solo los campos editables que cambiaron respecto del perfil cargado. Vacío: no hay nada que enviar.
export function diffEditableProfile(
  original: Pick<PatientProfile, EditableProfileField>,
  draft: EditableProfileDraft
): EditableProfilePatch {
  const patch: EditableProfilePatch = {};
  for (const field of EDITABLE_PROFILE_FIELDS) {
    const next = normalizeEditable(draft[field]);
    if (next !== normalizeEditable(original[field])) {
      patch[field] = next;
    }
  }
  return patch;
}

const EDITABLE_LABELS: Record<EditableProfileField, string> = {
  address: "La dirección",
  emergencyContactName: "El nombre del contacto",
  emergencyContactPhone: "El teléfono del contacto",
  phone: "El número",
};

// Mismo límite que el DTO, medido sobre el texto recortado. null si todo es válido.
export function validateEditableProfile(
  draft: EditableProfileDraft
): string | null {
  for (const field of EDITABLE_PROFILE_FIELDS) {
    const value = normalizeEditable(draft[field]);
    const max = EDITABLE_PROFILE_LIMITS[field];
    if (value && value.length > max) {
      return `${EDITABLE_LABELS[field]} admite hasta ${max} caracteres.`;
    }
  }
  return null;
}

export function updateProfile(
  fields: EditableProfilePatch
): Promise<{ updated: EditableProfileField[] }> {
  return request("/me/profile", {
    body: JSON.stringify(fields),
    method: "PATCH",
  });
}

// Nombre legal para mostrar (mismo criterio que la web: nombre(s) y apellidos). null si no hay nada utilizable.
export function legalFullName(
  profile: Pick<PatientProfile, "firstName" | "lastName">
): string | null {
  const name = [profile.firstName, profile.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return name || null;
}

// Reaceptación pendiente (D-37, RN-140): no bloquea la app; el backend sigue impidiendo agendar.
export function isReacceptancePending(status: RegistrationStatus): boolean {
  return (
    status.profileCompleted &&
    !status.legal.accepted &&
    status.legal.reacceptanceRequired === true
  );
}

// Pasos que se exigen antes de mostrar la app. La verificación de identidad (INE) no bloquea: el backend la
// exige en las operaciones que la requieren (canBookAppointments). Mismo criterio que apps/web.
export function pendingRegistrationStep(
  status: RegistrationStatus
): "profile" | "legal" | null {
  if (!status.profileCompleted) {
    return "profile";
  }
  if (!status.legal.accepted) {
    return "legal";
  }
  return null;
}

// Verificación de identidad del paciente (RF-07). El estado siempre lo decide el backend: la app nunca lo infiere
// de su propio envío. Los documentos se suben al backend, que los guarda en su almacenamiento privado; la app no los
// conserva (solo los tiene en memoria hasta enviarlos).
export type IdentityVerification = {
  status: IdentityVerificationStatus;
  attempt: number;
  rejectionReason: string | null;
};

export type IdentityDocumentImage = {
  uri: string;
  mimeType: "image/jpeg" | "image/png";
};

export type IdentitySubmission = {
  submissionId: string;
  status: "pending";
  attempt: number;
};

export function getIdentityVerification(): Promise<IdentityVerification> {
  return request("/me/identity-verification");
}

// El servidor genera las claves de los objetos: el nombre de archivo que se envía no lleva datos personales.
function documentPart(side: "front" | "back", image: IdentityDocumentImage) {
  const extension = image.mimeType === "image/png" ? "png" : "jpg";
  return { name: `${side}.${extension}`, type: image.mimeType, uri: image.uri };
}

export function submitIdentityVerification(
  front: IdentityDocumentImage,
  back: IdentityDocumentImage
): Promise<IdentitySubmission> {
  const body = new FormData();
  // React Native acepta { uri, name, type } como archivo de un multipart.
  body.append("front", documentPart("front", front) as unknown as Blob);
  body.append("back", documentPart("back", back) as unknown as Blob);
  return request("/me/identity-verification", { body, method: "POST" });
}

// Requisito de identidad que bloquea una operación (details.missing de RegistrationIncompleteError), o null.
export type IdentityRequirement =
  | "identity_submission"
  | "identity_review"
  | "identity_resubmission";

const IDENTITY_REQUIREMENTS: readonly IdentityRequirement[] = [
  "identity_submission",
  "identity_resubmission",
  "identity_review",
];

export function identityRequirementOf(
  error: unknown
): IdentityRequirement | null {
  if (
    !(error instanceof ApiError) ||
    error.error !== "RegistrationIncompleteError"
  ) {
    return null;
  }
  return IDENTITY_REQUIREMENTS.find((r) => error.missing.includes(r)) ?? null;
}

// F4 Payments (móvil): los mismos endpoints que la web (apps/backend/src/modules/payments/presentation).
//   GET  /me/patient/appointments/:id                 (M08: estado, precio y retención de la cita)
//   POST /me/patient/appointments/:id/payment         (Idempotency-Key; token = PaymentMethod de Stripe, SIN importe)
//   POST /me/patient/payments/:paymentId/sync         (estado real y, si se capturó, confirmación de la cita)

export type PatientAppointment = {
  id: string;
  doctorProfileId: string;
  status: string;
  scheduledAt: string;
  reason: string;
  price: string;
  holdExpiresAt: string | null;
};

// Citas del paciente (M08): GET /me/patient/appointments → { appointments }. Incluye todos los estados; quien la usa
// decide cuáles mostrar.
export async function listPatientAppointments(): Promise<PatientAppointment[]> {
  const view = await request<{ appointments: PatientAppointment[] }>(
    "/me/patient/appointments"
  );
  return view.appointments;
}

export type PaymentStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled"
  | "refunded"
  | "partially_refunded"
  | "charged_back"
  | "in_dispute";

export type PaymentConfirmation =
  | { result: "confirmed" }
  | { result: "already_confirmed" }
  | { result: "not_confirmable"; reason: string }
  | { result: "not_requested" }
  | { result: "confirmation_failed" };

export type PatientPayment = {
  paymentId: string;
  status: PaymentStatus;
  amount: string;
  currency: "MXN";
  appointmentConfirmed: boolean;
  confirmation: PaymentConfirmation;
  recoverable: boolean;
  // El cobro espera la autenticación 3-D Secure del paciente (el SDK de Stripe la completa con este secreto de un solo
  // pago). Solo vive en memoria durante el reto: nunca se guarda.
  nextAction?: { type: "stripe_sdk"; clientSecret: string };
};

// Referencia del medio de pago que crea el SDK de Stripe (pm_…). Sin importe ni datos de la tarjeta: el importe lo fija
// el backend con el precio de la cita.
export type CardPaymentInput = {
  token: string;
};

export function getPatientAppointment(id: string): Promise<PatientAppointment> {
  return request(`/me/patient/appointments/${encodeURIComponent(id)}`);
}

export function payAppointment(
  appointmentId: string,
  idempotencyKey: string,
  card: CardPaymentInput
): Promise<PatientPayment> {
  return request(
    `/me/patient/appointments/${encodeURIComponent(appointmentId)}/payment`,
    {
      body: JSON.stringify({ token: card.token }),
      headers: { "Idempotency-Key": idempotencyKey },
      method: "POST",
    }
  );
}

export function syncAppointmentPayment(
  paymentId: string
): Promise<PatientPayment> {
  return request(`/me/patient/payments/${encodeURIComponent(paymentId)}/sync`, {
    method: "POST",
  });
}

// Reserva (M08, apps/backend/src/modules/appointments/presentation/appointments.controllers.ts):
//   GET  /doctors/:doctorProfileId/slots?from=AAAA-MM-DD&to=AAAA-MM-DD   (horarios libres de M07, 31 días como máximo)
//   POST /me/patient/appointments  { doctorProfileId, startsAt, reason }  (crea la cita en pending_payment con retención;
//        RB-2: pedir otra vez el mismo horario con la retención vigente devuelve la misma cita)

export type DoctorSlot = {
  startsAt: string;
  endsAt: string;
  date: string; // fecha local AAAA-MM-DD
  start: string; // hora local HH:MM
  end: string;
};

export type DoctorSlots = {
  timeZone: string;
  doctorProfileId: string;
  durationMinutes: number;
  from: string;
  to: string;
  slots: DoctorSlot[];
};

export type HoldInput = {
  doctorProfileId: string;
  startsAt: string;
  reason: string;
};

export function getDoctorSlots(
  doctorProfileId: string,
  from: string,
  to: string
): Promise<DoctorSlots> {
  const query = new URLSearchParams({ from, to }).toString();
  return request(
    `/doctors/${encodeURIComponent(doctorProfileId)}/slots?${query}`
  );
}

export function holdAppointment(input: HoldInput): Promise<PatientAppointment> {
  return request("/me/patient/appointments", {
    body: JSON.stringify(input),
    method: "POST",
  });
}

// Médicos que se pueden reservar (M08 CC-6): GET /doctors/bookable. Solo nombre para mostrar y especialidad.
export type BookableDoctor = {
  doctorProfileId: string;
  displayName: string;
  specialty: { id: string; name: string };
};

export async function getBookableDoctors(): Promise<BookableDoctor[]> {
  const view = await request<{ timeZone: string; doctors: BookableDoctor[] }>(
    "/doctors/bookable"
  );
  return view.doctors;
}

// Videoconsulta (backend modules/video). La hora es la del servidor; el cliente no envía cuerpo ni horas.
//   GET  /me/patient/appointments/:id/session            estado (también evalúa inasistencias)
//   POST /me/patient/appointments/:id/session/enter      entrar a la sala desde T0 − 15 (también reconecta)
//   POST /me/patient/appointments/:id/session/presence   latido cada 15 s; nunca reabre una presencia cerrada
//   POST /me/patient/appointments/:id/session/leave      salida voluntaria (no cancela la cita)
//   POST /me/patient/appointments/:id/session/token      credencial del proveedor, solo con la consulta activa
export const VIDEO_HEARTBEAT_MS = 15_000;

export type VideoSessionPhase =
  | "not_open"
  | "waiting"
  | "active"
  | "ended"
  | "closed";

export type VideoPendingResolution =
  | "r5_beyond_total_limit"
  | "late_patient_left_before_doctor"
  | "late_patient_not_admitted"
  | "no_rule";

export type VideoSessionState = {
  appointmentId: string;
  appointmentStatus: string;
  phase: VideoSessionPhase;
  serverTime: string;
  scheduledAt: string;
  opensAt: string;
  patient: { present: boolean; joinedAt: string | null };
  doctor: {
    present: boolean;
    joinedAt: string | null;
    busyWithAnotherConsultation: boolean;
  };
  deadlines: {
    patientToleranceEndsAt: string;
    doctorDeadlineAt: string;
    reconnectGraceEndsAt: string | null;
  };
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  pendingResolution: VideoPendingResolution | null;
};

export type VideoCallToken = { provider: string; authToken: string };

const sessionPath = (appointmentId: string, action?: string) =>
  `/me/patient/appointments/${encodeURIComponent(appointmentId)}/session${action ? `/${action}` : ""}`;

export function getVideoSession(
  appointmentId: string
): Promise<VideoSessionState> {
  return request(sessionPath(appointmentId));
}

export function enterVideoSession(
  appointmentId: string
): Promise<VideoSessionState> {
  return request(sessionPath(appointmentId, "enter"), { method: "POST" });
}

export function sendVideoPresence(
  appointmentId: string
): Promise<VideoSessionState> {
  return request(sessionPath(appointmentId, "presence"), { method: "POST" });
}

export function leaveVideoSession(
  appointmentId: string
): Promise<VideoSessionState> {
  return request(sessionPath(appointmentId, "leave"), { method: "POST" });
}

export function getVideoCallToken(
  appointmentId: string
): Promise<VideoCallToken> {
  return request(sessionPath(appointmentId, "token"), { method: "POST" });
}

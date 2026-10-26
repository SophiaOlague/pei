// Cliente de los endpoints REST del backend de PEI (fuera de Better Auth). La sesión viaja en la cookie
// de Better Auth; el backend la valida en cada petición (SessionGuard). Contratos en apps/backend:
//   GET  /legal-documents/current?audience=patient  (legal-documents.controller.ts)
//   GET  /me/registration-status                    (me.controller.ts, registration-status.ts)
//   POST /me/patient-profile                        (RegisterPatientProfileDto)
//   POST /me/legal-acceptances                      (AcceptLegalDocumentsDto)

const API_ORIGIN = new URL(
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/auth",
).origin;

export type LegalDocumentType =
  | "privacy_notice"
  | "terms_and_conditions"
  | "privacy_policy"
  | "patient_terms"
  | "doctor_terms";

export interface LegalDocument {
  id: string;
  type: LegalDocumentType;
  version: string;
  publishedAt: string;
  content: string;
}

export interface PendingLegalDocument {
  type: LegalDocumentType;
  documentId: string;
  version: string;
}

export type MissingRequirement =
  | "profile"
  | "legal"
  | "identity_submission"
  | "identity_review"
  | "identity_resubmission";

export interface RegistrationStatus {
  profileCompleted: boolean;
  legal: { accepted: boolean; pending: PendingLegalDocument[] };
  identity: {
    status: "not_submitted" | "pending" | "rejected" | "approved";
    rejectionReason: string | null;
  };
  registrationComplete: boolean;
  canBookAppointments: boolean;
  missing: MissingRequirement[];
}

export interface PatientProfileInput {
  firstName: string;
  lastName: string;
  curp: string;
  birthDate: string; // AAAA-MM-DD
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly error?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ErrorBody = { message?: string | string[]; error?: string };

function messageFor(status: number, body: ErrorBody | null): string {
  if (status === 401) return "Tu sesión expiró. Inicia sesión de nuevo.";
  if (status === 429)
    return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
  if (status >= 500)
    return "El servidor no pudo completar la operación. Inténtalo de nuevo.";
  const message = body?.message;
  if (Array.isArray(message)) return message.join(". ");
  return message || "No se pudo completar la operación. Inténtalo de nuevo.";
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  // Con FormData el navegador fija Content-Type (multipart con su boundary).
  const headers =
    init?.body instanceof FormData
      ? init.headers
      : { "Content-Type": "application/json", ...init?.headers };
  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}${path}`, {
      ...init,
      credentials: "include",
      headers,
    });
  } catch {
    throw new ApiError(
      0,
      "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.",
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    throw new ApiError(
      response.status,
      messageFor(response.status, body),
      body?.error,
    );
  }
  return response;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await (await send(path, init)).json()) as T;
}

export function getRegistrationStatus(): Promise<RegistrationStatus> {
  return request("/me/registration-status");
}

export function getCurrentLegalDocuments(): Promise<LegalDocument[]> {
  return request("/legal-documents/current?audience=patient");
}

export function createPatientProfile(
  input: PatientProfileInput,
): Promise<{ patientProfileId: string; userProfileId: string }> {
  return request("/me/patient-profile", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function acceptLegalDocuments(documentIds: string[]): Promise<{
  accepted: { documentId: string; type: string; version: string }[];
}> {
  return request("/me/legal-acceptances", {
    method: "POST",
    body: JSON.stringify({ documentIds }),
  });
}

// Pasos que el panel exige antes de mostrarse. La verificación de identidad (INE) no bloquea el panel:
// el backend la exige en las operaciones que la requieren (canBookAppointments).
export function pendingRegistrationStep(
  status: RegistrationStatus,
): "profile" | "legal" | null {
  if (!status.profileCompleted) return "profile";
  if (!status.legal.accepted) return "legal";
  return null;
}

// Perfil del paciente (RF-09, DP-12). Nombre, CURP y fecha de nacimiento son de solo lectura;
// PATCH admite solo los cuatro campos editables y null borra el valor.
export interface PatientProfile {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  curp: string;
  phone: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  hasPhoto: boolean;
}

export type EditableProfileField =
  | "phone"
  | "address"
  | "emergencyContactName"
  | "emergencyContactPhone";

export const EDITABLE_PROFILE_FIELDS: readonly EditableProfileField[] = [
  "phone",
  "address",
  "emergencyContactName",
  "emergencyContactPhone",
];

export function getProfile(): Promise<PatientProfile> {
  return request("/me/profile");
}

export function updateProfile(
  fields: Partial<Record<EditableProfileField, string | null>>,
): Promise<{ updated: EditableProfileField[] }> {
  return request("/me/profile", {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
}

// DT-7: JPEG o PNG (el backend los valida por contenido), hasta 5 MB, en el campo "photo".
export const PROFILE_PHOTO_TYPES = ["image/jpeg", "image/png"];
export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export function uploadProfilePhoto(file: File): Promise<{ hasPhoto: true }> {
  const body = new FormData();
  body.append("photo", file);
  return request("/me/profile/photo", { method: "PUT", body });
}

// La foto es privada: se descarga con la sesión y se muestra desde un blob local.
export async function getProfilePhoto(): Promise<Blob> {
  // El backend responde Cache-Control: no-store; tampoco se reutiliza una copia del navegador.
  return (await send("/me/profile/photo", { cache: "no-store" })).blob();
}

// GET /me (RF-02): cuenta, rol y, si es paciente, su perfil. Se usa para el nombre del encabezado.
export interface Me {
  user: { id: string; email: string };
  role: "patient" | "doctor" | "admin" | "organization" | null;
  profile: PatientProfile | null;
  registrationStatus: RegistrationStatus | null;
}

// Una sola petición por usuario mientras dure la página: el encabezado aparece en todas las pantallas y el
// nombre legal no cambia (DP-12). Se descarta al cerrar sesión o si la petición falla.
let meCache: { userId: string; request: Promise<Me> } | null = null;

export function getMeCached(userId: string): Promise<Me> {
  if (meCache?.userId !== userId) {
    const pending = fetchMe();
    meCache = { userId, request: pending };
    pending.catch(() => {
      if (meCache?.request === pending) meCache = null;
    });
  }
  return meCache.request;
}

function fetchMe(): Promise<Me> {
  return request("/me");
}

// GET /me sin caché, para decidir la navegación por rol (el administrador no entra al registro de pacientes).
// No usa getMeCached: durante el registro el perfil cambia y la caché del encabezado quedaría desactualizada.
export function getMe(): Promise<Me> {
  return fetchMe();
}

export function clearMeCache(): void {
  meCache = null;
  clearPhotoCache();
}

// Foto de perfil compartida por el encabezado y el perfil: una descarga por usuario y versión, mostrada
// desde un blob local. La URL anterior se libera al reemplazarla (foto nueva) o al cerrar sesión.
let photoCache: { userId: string; request: Promise<string | null> } | null =
  null;
const photoListeners = new Set<() => void>();

function clearPhotoCache(): void {
  const previous = photoCache;
  photoCache = null;
  previous?.request.then((url) => url && URL.revokeObjectURL(url));
}

// null si no tiene foto o si la descarga falla (se reintenta en la siguiente consulta).
export function getProfilePhotoUrlCached(
  userId: string,
  hasPhoto: boolean,
): Promise<string | null> {
  if (!hasPhoto) return Promise.resolve(null);
  if (photoCache?.userId !== userId) {
    clearPhotoCache();
    const pending = getProfilePhoto()
      .then((blob) => URL.createObjectURL(blob))
      .catch(() => {
        if (photoCache?.request === pending) photoCache = null;
        return null;
      });
    photoCache = { userId, request: pending };
  }
  return photoCache.request;
}

// Tras PUT /me/profile/photo: el perfil en caché pasa a tener foto, se descarta la anterior y se avisa a
// quienes la muestran para que la vuelvan a pedir.
export function profilePhotoChanged(userId: string): void {
  if (meCache?.userId === userId) {
    const withPhoto = meCache.request.then((me) => ({
      ...me,
      profile: me.profile && { ...me.profile, hasPhoto: true },
    }));
    meCache = { userId, request: withPhoto };
  }
  clearPhotoCache();
  for (const listener of photoListeners) listener();
}

export function subscribeProfilePhoto(listener: () => void): () => void {
  photoListeners.add(listener);
  return () => {
    photoListeners.delete(listener);
  };
}

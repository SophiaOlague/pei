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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init?.headers },
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
  return (await response.json()) as T;
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

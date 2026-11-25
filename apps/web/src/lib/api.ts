// Cliente de los endpoints REST del backend de PEI (fuera de Better Auth). La sesión viaja en la cookie
// de Better Auth; el backend la valida en cada petición (SessionGuard). Contratos en apps/backend:
//   GET  /legal-documents/current?audience=patient  (legal-documents.controller.ts)
//   GET  /me/registration-status                    (me.controller.ts, registration-status.ts)
//   POST /me/patient-profile                        (RegisterPatientProfileDto)
//   POST /me/legal-acceptances                      (AcceptLegalDocumentsDto)
// Portal profesional (apps/backend/src/modules/doctors/presentation, solo web):
//   GET  /specialties                               (specialties.controller.ts)
//   POST /me/doctor-profile, GET/PATCH, PUT …/specialty, PUT/GET …/photo  (me-doctor.controller.ts)
//   GET  /me/doctor/status, GET /me/doctor/verification-history
//   POST /me/doctor/identity-verifications (front, back), POST /me/doctor/license-verifications (licenseNumber, document)

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

export type IdentityVerificationStatus =
  | "not_submitted"
  | "pending"
  | "rejected"
  | "approved";

export interface RegistrationStatus {
  profileCompleted: boolean;
  // reacceptanceRequired (D-37, RN-140): ya completó su registro y solo falta aceptar una versión nueva. Lo decide el
  // backend con las aceptaciones guardadas; sin el campo se trata como registro inicial (bloquea).
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
}

export interface PatientProfileInput {
  firstName: string;
  lastName: string;
  curp: string;
  birthDate: string; // AAAA-MM-DD
}

// missing: requisitos que faltan según el backend (details.missing de RegistrationIncompleteError); vacío si no aplica.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly error?: string,
    readonly missing: readonly string[] = [],
  ) {
    super(message);
    this.name = "ApiError";
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
      missingFrom(body),
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

export function getCurrentLegalDocuments(
  audience: "patient" | "doctor" = "patient",
): Promise<LegalDocument[]> {
  return request(`/legal-documents/current?audience=${audience}`);
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

// Reaceptación pendiente (D-37, RN-140): no bloquea el panel; el backend sigue impidiendo agendar.
export function isReacceptancePending(status: RegistrationStatus): boolean {
  return (
    status.profileCompleted &&
    !status.legal.accepted &&
    status.legal.reacceptanceRequired === true
  );
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

// Verificación de identidad del paciente (RF-07; me.controller.ts):
//   GET  /me/identity-verification  → estado del último envío (not_submitted | pending | approved | rejected).
//   POST /me/identity-verification  → multipart front/back, JPEG o PNG de máximo 5 MB; el backend decide por la firma
//                                     binaria, guarda los documentos en su almacenamiento privado y limita los envíos.
// El estado siempre lo decide el backend: la interfaz nunca lo infiere de su propio envío.
export interface IdentityVerification {
  status: IdentityVerificationStatus;
  attempt: number;
  rejectionReason: string | null;
}

export interface IdentitySubmission {
  submissionId: string;
  status: "pending";
  attempt: number;
}

export const IDENTITY_DOCUMENT_TYPES = ["image/jpeg", "image/png"];
export const IDENTITY_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;

export function getIdentityVerification(): Promise<IdentityVerification> {
  return request("/me/identity-verification");
}

// El nombre del archivo lo fija la interfaz: el del dispositivo podría contener datos personales.
const documentName = (side: "front" | "back", file: File) =>
  `${side}.${file.type === "image/png" ? "png" : "jpg"}`;

export function submitIdentityVerification(
  front: File,
  back: File,
): Promise<IdentitySubmission> {
  const body = new FormData();
  body.append("front", front, documentName("front", front));
  body.append("back", back, documentName("back", back));
  return request("/me/identity-verification", { method: "POST", body });
}

// Requisito de identidad pendiente (details.missing de RegistrationIncompleteError o `missing` del estado del
// registro), o null. Orden: reenviar, enviar, en revisión.
export type IdentityRequirement =
  | "identity_submission"
  | "identity_review"
  | "identity_resubmission";

const IDENTITY_REQUIREMENTS: readonly IdentityRequirement[] = [
  "identity_resubmission",
  "identity_submission",
  "identity_review",
];

export function identityRequirementIn(
  missing: readonly string[],
): IdentityRequirement | null {
  return IDENTITY_REQUIREMENTS.find((r) => missing.includes(r)) ?? null;
}

export function identityRequirementOf(
  error: unknown,
): IdentityRequirement | null {
  return error instanceof ApiError &&
    error.error === "RegistrationIncompleteError"
    ? identityRequirementIn(error.missing)
    : null;
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

// ---------------------------------------------------------------------------------------------------------------
// Portal profesional (médico). El rol lo fija el backend al crear el perfil; el cliente nunca lo envía.
// ---------------------------------------------------------------------------------------------------------------

export interface Specialty {
  id: string;
  code: string;
  name: string;
}

export interface DoctorProfileInput {
  firstName: string;
  lastName: string;
  curp: string;
  specialtyId: string;
  phone?: string;
  bio?: string;
}

export interface DoctorProfile {
  doctorProfileId: string;
  firstName: string;
  lastName: string;
  curp: string;
  phone: string | null;
  bio: string | null;
  licenseNumber: string | null;
  specialty: (Specialty & { isActive: boolean }) | null;
  hasPhoto: boolean;
}

export type DoctorLineStatus = "required" | "pending" | "approved" | "rejected";
export type DoctorMissingItem =
  | "profile"
  | "legal"
  | "identity_submission"
  | "identity_resubmission"
  | "license_submission"
  | "license_resubmission";

// D-38: `status` es el estado administrativo (revisiones de INE y cédula); `legalAccepted`, la aceptación de las
// versiones legales vigentes; `canOperate`, la habilitación operativa que deriva el backend. Son independientes.
export interface DoctorStatus {
  status: "pending" | "approved" | "rejected";
  identity: DoctorLineStatus;
  professional: DoctorLineStatus;
  registrationComplete: boolean;
  legalAccepted: boolean;
  canOperate: boolean;
  missing: DoctorMissingItem[];
  identityRejectionReason: string | null;
  licenseRejectionReason: string | null;
}

export type ReviewStatus = "pending" | "approved" | "rejected" | "superseded";

export interface VerificationHistoryItem {
  attempt: number;
  revision: number;
  status: ReviewStatus;
  submittedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

export interface DoctorVerificationHistory {
  identity: VerificationHistoryItem[];
  license: (VerificationHistoryItem & { reason: string })[];
}

// Límites del backend (doctors/domain/object-keys.ts): INE y foto JPEG o PNG; cédula PDF, JPEG o PNG.
export const DOCTOR_IMAGE_TYPES = ["image/jpeg", "image/png"];
export const DOCTOR_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const DOCTOR_LICENSE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];
export const DOCTOR_LICENSE_MAX_BYTES = 10 * 1024 * 1024;

export function getSpecialties(): Promise<Specialty[]> {
  return request("/specialties");
}

export function createDoctorProfile(
  input: DoctorProfileInput,
): Promise<{ doctorProfileId: string; userProfileId: string }> {
  return request("/me/doctor-profile", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getDoctorProfile(): Promise<DoctorProfile> {
  return request("/me/doctor-profile");
}

// null borra el valor; el backend exige al menos un campo.
export async function updateDoctorProfile(fields: {
  phone?: string | null;
  bio?: string | null;
}): Promise<void> {
  await send("/me/doctor-profile", {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
}

export async function changeDoctorSpecialty(
  specialtyId: string,
): Promise<void> {
  await send("/me/doctor-profile/specialty", {
    method: "PUT",
    body: JSON.stringify({ specialtyId }),
  });
}

export async function uploadDoctorPhoto(file: File): Promise<void> {
  const body = new FormData();
  body.append("photo", file);
  await send("/me/doctor-profile/photo", { method: "PUT", body });
}

export function getDoctorStatus(): Promise<DoctorStatus> {
  return request("/me/doctor/status");
}

export function getDoctorVerificationHistory(): Promise<DoctorVerificationHistory> {
  return request("/me/doctor/verification-history");
}

export function submitDoctorIdentity(
  front: File,
  back: File,
): Promise<{ reviewId: string; attempt: number; status: string }> {
  const body = new FormData();
  body.append("front", front);
  body.append("back", back);
  return request("/me/doctor/identity-verifications", { method: "POST", body });
}

export function submitDoctorLicense(
  licenseNumber: string,
  document: File,
): Promise<{ reviewId: string; attempt: number; status: string }> {
  const body = new FormData();
  body.append("licenseNumber", licenseNumber);
  body.append("document", document);
  return request("/me/doctor/license-verifications", { method: "POST", body });
}

// ---------------------------------------------------------------------------------------------------------------
// Administración de M03 (apps/backend/src/modules/doctors/presentation/admin-doctors.controller.ts). Solo admin:
// el backend responde 401 sin sesión y 403 con otro rol. Ninguna respuesta incluye claves de objetos ni URLs.
//   GET  /admin/doctors?status&page&pageSize, GET /admin/doctors/:id
//   GET  /admin/doctor-identity-verifications, GET …/:id, GET …/:id/documents/front|back, POST …/:id/approve|reject
//   GET  /admin/doctor-license-verifications, GET …/:id, GET …/:id/document, POST …/:id/approve|reject
// El estado del médico es el derivado por el backend (doctor-status.ts); la interfaz no lo recalcula.
// ---------------------------------------------------------------------------------------------------------------

export type DoctorGlobalStatus = "pending" | "approved" | "rejected";

// DoctorStatus de dominio (doctor-status.ts), sin los motivos de rechazo que añade GET /me/doctor/status. D-38:
// `status` (y el filtro ?status=) es la aprobación administrativa; la aceptación legal y la habilitación se informan
// aparte y no generan acciones administrativas.
export type AdminDoctorStatusFields = Omit<
  DoctorStatus,
  "identityRejectionReason" | "licenseRejectionReason"
>;

export interface Page<T> {
  items: T[];
  total: number;
}

export interface PageQuery {
  page?: number;
  // El backend acepta de 1 a 100 (PageQueryDto); por omisión, 20.
  pageSize?: number;
}

export interface AdminDoctorItem extends AdminDoctorStatusFields {
  doctorProfileId: string;
  firstName: string;
  lastName: string;
  specialty: (Specialty & { isActive: boolean }) | null;
}

export interface AdminReviewHistoryItem {
  id: string;
  attempt: number;
  revision: number;
  status: ReviewStatus;
  submittedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

export type LicenseReviewReason =
  | "initial"
  | "resubmission"
  | "license_number_changed"
  | "license_document_changed"
  | "specialty_changed"
  | "legal_name_changed";

export interface AdminDoctorDetail extends AdminDoctorStatusFields {
  doctorProfileId: string;
  firstName: string;
  lastName: string;
  curp: string;
  phone: string | null;
  licenseNumber: string | null;
  specialty: (Specialty & { isActive: boolean }) | null;
  identityRevision: number;
  professionalRevision: number;
  history: {
    identity: AdminReviewHistoryItem[];
    license: (AdminReviewHistoryItem & {
      reason: LicenseReviewReason;
      licenseNumber: string;
    })[];
  };
}

// Elemento de las colas de revisiones pendientes (en orden de llegada, sin documentos).
export interface AdminReviewSummary extends AdminReviewHistoryItem {
  doctorProfileId: string;
}

export interface AdminIdentityReviewDetail extends AdminReviewSummary {
  isCurrent: boolean;
  documentsAvailable: boolean;
  doctor: { firstName: string; lastName: string; curp: string };
}

export interface AdminLicenseReviewDetail extends AdminReviewSummary {
  isCurrent: boolean;
  reason: LicenseReviewReason;
  licenseNumber: string;
  specialty: Specialty | null;
  doctor: { firstName: string; lastName: string };
}

export interface AdminReviewResult {
  reviewId: string;
  status: "approved" | "rejected";
  attempt: number;
  doctorStatus: AdminDoctorStatusFields;
  // INE: si se purgaron los documentos tras la decisión. Cédula: null (se conserva, D-16).
  documentsDeleted: boolean | null;
}

// D-25 (doctors/domain/review.ts): motivo obligatorio al rechazar, de 10 a 500 caracteres tras recortar.
export const REJECTION_REASON_MIN = 10;
export const REJECTION_REASON_MAX = 500;

export type DocumentSide = "front" | "back";

function pageParams(
  query: PageQuery & { status?: DoctorGlobalStatus },
): string {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const text = params.toString();
  return text ? `?${text}` : "";
}

const segment = (value: string) => encodeURIComponent(value);

export function listAdminDoctors(
  query: PageQuery & { status?: DoctorGlobalStatus } = {},
): Promise<Page<AdminDoctorItem>> {
  return request(`/admin/doctors${pageParams(query)}`);
}

export function getAdminDoctor(
  doctorProfileId: string,
): Promise<AdminDoctorDetail> {
  return request(`/admin/doctors/${segment(doctorProfileId)}`);
}

export function listPendingDoctorIdentityReviews(
  query: PageQuery = {},
): Promise<Page<AdminReviewSummary>> {
  return request(`/admin/doctor-identity-verifications${pageParams(query)}`);
}

export function getDoctorIdentityReview(
  reviewId: string,
): Promise<AdminIdentityReviewDetail> {
  return request(`/admin/doctor-identity-verifications/${segment(reviewId)}`);
}

// Documentos privados: se descargan con la sesión, sin caché del navegador ni copia en memoria compartida. Quien
// cree un blob: URL con el resultado debe liberarlo (URL.revokeObjectURL) al dejar de mostrarlo.
export async function getDoctorIdentityDocument(
  reviewId: string,
  side: DocumentSide,
): Promise<Blob> {
  return (
    await send(
      `/admin/doctor-identity-verifications/${segment(reviewId)}/documents/${side}`,
      { cache: "no-store" },
    )
  ).blob();
}

export function approveDoctorIdentityReview(
  reviewId: string,
): Promise<AdminReviewResult> {
  return request(
    `/admin/doctor-identity-verifications/${segment(reviewId)}/approve`,
    { method: "POST" },
  );
}

export function rejectDoctorIdentityReview(
  reviewId: string,
  reason: string,
): Promise<AdminReviewResult> {
  return request(
    `/admin/doctor-identity-verifications/${segment(reviewId)}/reject`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

export function listPendingDoctorLicenseReviews(
  query: PageQuery = {},
): Promise<Page<AdminReviewSummary & { reason: LicenseReviewReason }>> {
  return request(`/admin/doctor-license-verifications${pageParams(query)}`);
}

export function getDoctorLicenseReview(
  reviewId: string,
): Promise<AdminLicenseReviewDetail> {
  return request(`/admin/doctor-license-verifications/${segment(reviewId)}`);
}

// PDF (attachment con CSP sandbox) o imagen; el tipo viene en Blob.type.
export async function getDoctorLicenseDocument(
  reviewId: string,
): Promise<Blob> {
  return (
    await send(
      `/admin/doctor-license-verifications/${segment(reviewId)}/document`,
      { cache: "no-store" },
    )
  ).blob();
}

export function approveDoctorLicenseReview(
  reviewId: string,
): Promise<AdminReviewResult> {
  return request(
    `/admin/doctor-license-verifications/${segment(reviewId)}/approve`,
    { method: "POST" },
  );
}

export function rejectDoctorLicenseReview(
  reviewId: string,
  reason: string,
): Promise<AdminReviewResult> {
  return request(
    `/admin/doctor-license-verifications/${segment(reviewId)}/reject`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Verificación de identidad de PACIENTES (RF-07; apps/backend/src/modules/identity/presentation/
// admin-identity-verifications.controller.ts). Solo admin: 401 sin sesión, 403 con otro rol. Endpoints propios de
// pacientes; nunca los de médicos. Ninguna respuesta incluye claves de objetos ni URLs.
//   GET  /admin/identity-verifications?page&pageSize   (solo pendientes, en orden de llegada; pageSize 1–50)
//   GET  /admin/identity-verifications/:id             (detalle con los datos del paciente, sin documentos)
//   GET  /admin/identity-verifications/:id/documents/front|back   (imagen, no-store; solo mientras está pendiente)
//   POST /admin/identity-verifications/:id/approve     POST …/:id/reject { reason } (10–500 caracteres)
// Al resolver, el backend elimina los documentos (documentsDeleted).
// ---------------------------------------------------------------------------------------------------------------

export type PatientIdentityStatus = "pending" | "approved" | "rejected";

export interface PatientIdentityRequestItem {
  id: string;
  attempt: number;
  submittedAt: string;
}

export interface PatientIdentityRequestDetail {
  id: string;
  status: PatientIdentityStatus;
  attempt: number;
  submittedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  patient: {
    firstName: string;
    lastName: string;
    birthDate: string | null;
    curp: string;
  };
}

export interface PatientIdentityReviewResult {
  submissionId: string;
  status: "approved" | "rejected";
  attempt: number;
  documentsDeleted: boolean;
}

// El backend admite de 1 a 50 por página (ListPendingIdentityVerificationsQueryDto).
export const PATIENT_IDENTITY_PAGE_SIZE_MAX = 50;

export function listPendingPatientIdentityRequests(
  query: PageQuery = {},
): Promise<Page<PatientIdentityRequestItem>> {
  return request(`/admin/identity-verifications${pageParams(query)}`);
}

export function getPatientIdentityRequest(
  requestId: string,
): Promise<PatientIdentityRequestDetail> {
  return request(`/admin/identity-verifications/${segment(requestId)}`);
}

// Documento privado: se descarga con la sesión y sin caché. Quien cree un blob: URL debe liberarlo.
export async function getPatientIdentityDocument(
  requestId: string,
  side: DocumentSide,
): Promise<Blob> {
  return (
    await send(
      `/admin/identity-verifications/${segment(requestId)}/documents/${side}`,
      { cache: "no-store" },
    )
  ).blob();
}

export function approvePatientIdentityRequest(
  requestId: string,
): Promise<PatientIdentityReviewResult> {
  return request(
    `/admin/identity-verifications/${segment(requestId)}/approve`,
    { method: "POST" },
  );
}

export function rejectPatientIdentityRequest(
  requestId: string,
  reason: string,
): Promise<PatientIdentityReviewResult> {
  return request(`/admin/identity-verifications/${segment(requestId)}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

// ── M07 Agenda médica (RF-10, RF-11). Todas las horas son del centro de México (America/Mexico_City). ──

export const AGENDA_TIME_ZONE = "America/Mexico_City";
export const AGENDA_DURATION_OPTIONS: readonly number[] = Array.from(
  { length: (120 - 15) / 5 + 1 },
  (_, i) => 15 + i * 5,
);
export const AGENDA_MAX_WINDOWS_PER_DAY = 6;

// weekday: 0 = domingo … 6 = sábado. start/end "HH:MM"; end puede ser "24:00".
export interface AgendaWindow {
  weekday: number;
  start: string;
  end: string;
}

export interface AgendaTimeOff {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export interface DoctorAgenda {
  timeZone: string;
  canOperate: boolean;
  durationMinutes: number;
  availability: AgendaWindow[];
  timeOff: AgendaTimeOff[];
}

export interface AgendaSlot {
  startsAt: string;
  endsAt: string;
  date: string;
  start: string;
  end: string;
}

export interface AgendaSlots {
  timeZone: string;
  durationMinutes: number;
  from: string;
  to: string;
  slots: AgendaSlot[];
}

const AGENDA = "/me/doctor/agenda";

export function getDoctorAgenda(): Promise<DoctorAgenda> {
  return request(AGENDA);
}

export async function replaceAgendaAvailability(
  windows: AgendaWindow[],
): Promise<AgendaWindow[]> {
  const res = await request<{ availability: AgendaWindow[] }>(
    `${AGENDA}/availability`,
    { method: "PUT", body: JSON.stringify({ windows }) },
  );
  return res.availability;
}

export async function changeAgendaDuration(minutes: number): Promise<number> {
  const res = await request<{ durationMinutes: number }>(`${AGENDA}/duration`, {
    method: "PUT",
    body: JSON.stringify({ minutes }),
  });
  return res.durationMinutes;
}

export function addAgendaTimeOff(input: {
  startsAt: string;
  endsAt: string;
  reason?: string;
}): Promise<AgendaTimeOff> {
  return request(`${AGENDA}/time-off`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function removeAgendaTimeOff(id: string): Promise<void> {
  await send(`${AGENDA}/time-off/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function getAgendaSlots(from: string, to: string): Promise<AgendaSlots> {
  const query = new URLSearchParams({ from, to });
  return request(`${AGENDA}/slots?${query}`);
}

// M08 (RF-66 propuesto, AP-2): precio global de consulta, en versiones. Solo administrador.
//   GET  /admin/consultation-price            versión vigente (404 si no hay)
//   GET  /admin/consultation-price/versions   historial
//   POST /admin/consultation-price/versions   { price: "250.00" } → nueva versión con vigencia inmediata
export interface ConsultationPriceVersion {
  id: string;
  price: string;
  currency: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdBy: string;
}

const CONSULTATION_PRICE = "/admin/consultation-price";

export function getConsultationPrice(): Promise<ConsultationPriceVersion> {
  return request(CONSULTATION_PRICE);
}

export async function listConsultationPriceVersions(): Promise<
  ConsultationPriceVersion[]
> {
  const res = await request<{ versions: ConsultationPriceVersion[] }>(
    `${CONSULTATION_PRICE}/versions`,
  );
  return res.versions;
}

export function publishConsultationPrice(
  price: string,
): Promise<ConsultationPriceVersion> {
  return request(`${CONSULTATION_PRICE}/versions`, {
    method: "POST",
    body: JSON.stringify({ price }),
  });
}

// Payments: pago de una consulta con Stripe (apps/backend/src/modules/payments/presentation). El cliente envía solo la
// referencia del medio de pago que crea Stripe.js (pm_…).
//   GET  /me/patient/appointments/:id                 (M08: estado, precio y retención de la cita)
//   POST /me/patient/appointments/:id/payment         (Idempotency-Key; cuerpo: token = PaymentMethod de Stripe, SIN importe)
//   POST /me/patient/payments/:paymentId/sync         (consulta el estado real y, si se capturó, confirma la cita)

export interface PatientAppointment {
  id: string;
  status: string;
  scheduledAt: string;
  price: string;
  holdExpiresAt: string | null;
  // El backend ya los envía (AppointmentView); opcionales para no exigirlos a los dobles de prueba existentes.
  doctorProfileId?: string;
  reason?: string;
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

export interface PatientPayment {
  paymentId: string;
  status: PaymentStatus;
  amount: string;
  currency: "MXN";
  appointmentConfirmed: boolean;
  confirmation: PaymentConfirmation;
  recoverable: boolean;
  // El cobro espera la autenticación 3-D Secure del paciente (Stripe.js la completa con este secreto de un solo pago).
  nextAction?: { type: "stripe_sdk"; clientSecret: string };
}

// Referencia de la tarjeta tokenizada por el proveedor. No hay importe: lo fija el backend con el precio de la cita.
// Con Stripe basta `token` (pm_…, el PaymentMethod que crea Stripe.js).
export interface CardPaymentInput {
  token: string;
}

export function getPatientAppointment(id: string): Promise<PatientAppointment> {
  return request(`/me/patient/appointments/${encodeURIComponent(id)}`);
}

export function payAppointment(
  appointmentId: string,
  idempotencyKey: string,
  card: CardPaymentInput,
): Promise<PatientPayment> {
  return request(
    `/me/patient/appointments/${encodeURIComponent(appointmentId)}/payment`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ token: card.token }),
    },
  );
}

export function syncAppointmentPayment(
  paymentId: string,
): Promise<PatientPayment> {
  return request(`/me/patient/payments/${encodeURIComponent(paymentId)}/sync`, {
    method: "POST",
  });
}

// ── M08: reserva de consultas por el paciente (apps/backend/src/modules/appointments/presentation/
//    appointments.controllers.ts). Mismos contratos que apps/mobile. Solo paciente: 401 sin sesión, 403 con otro rol.
//   GET  /doctors/bookable                      → médicos que pueden operar y tienen horarios (CC-6)
//   GET  /doctors/:doctorProfileId/slots?from&to → horarios libres (M07; máximo 31 días por consulta)
//   POST /me/patient/appointments               → { doctorProfileId, startsAt, reason } → cita pending_payment con
//                                                  retención de 5 minutos. El backend valida el horario (RB-1), la
//                                                  retención única (RB-3), el registro y la identidad del paciente
//                                                  (RegistrationIncompleteError), y toma el precio vigente.
//   GET  /me/patient/appointments               → { appointments: AppointmentView[] } (sin nombre del médico)
// La confirmación solo la hace el backend al confirmarse el pago (AP-16); la interfaz nunca la supone.

export type AppointmentStatus =
  | "pending_payment"
  | "expired"
  | "confirmed"
  | "completed"
  | "canceled"
  | "no_show_patient"
  | "no_show_doctor"
  | "no_show_both"
  | "rescheduled";

export interface BookableDoctor {
  doctorProfileId: string;
  displayName: string;
  specialty: { id: string; name: string };
}

export interface DoctorSlot {
  startsAt: string;
  endsAt: string;
  // Fecha y horas civiles en la zona de la agenda (timeZone).
  date: string;
  start: string;
  end: string;
}

export interface DoctorSlots {
  timeZone: string;
  doctorProfileId: string;
  durationMinutes: number;
  from: string;
  to: string;
  slots: DoctorSlot[];
}

export interface HoldInput {
  doctorProfileId: string;
  startsAt: string;
  reason: string;
}

// AppointmentView de M08.
export interface PatientAppointmentDetail {
  id: string;
  doctorProfileId: string;
  patientProfileId: string;
  status: AppointmentStatus;
  scheduledAt: string;
  reason: string;
  price: string;
  holdExpiresAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
}

// Motivo de la consulta: de 1 a 500 caracteres tras recortar (MAX_REASON_LENGTH de M08).
export const APPOINTMENT_REASON_MAX = 500;

export async function getBookableDoctors(): Promise<BookableDoctor[]> {
  const view = await request<{ timeZone: string; doctors: BookableDoctor[] }>(
    "/doctors/bookable",
  );
  return view.doctors;
}

export function getDoctorSlots(
  doctorProfileId: string,
  from: string,
  to: string,
): Promise<DoctorSlots> {
  const query = new URLSearchParams({ from, to }).toString();
  return request(
    `/doctors/${encodeURIComponent(doctorProfileId)}/slots?${query}`,
  );
}

export function holdAppointment(
  input: HoldInput,
): Promise<PatientAppointmentDetail> {
  return request("/me/patient/appointments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listPatientAppointments(): Promise<
  PatientAppointmentDetail[]
> {
  return (
    await request<{ appointments: PatientAppointmentDetail[] }>(
      "/me/patient/appointments",
    )
  ).appointments;
}

// Videoconsulta del médico (RF-18 a RF-22). La sala, la presencia y las inasistencias son de PEI; el proveedor de
// video solo transporta audio y video después de la admisión. Ninguna llamada envía horas: manda el servidor.
export type SessionPhase =
  | "not_open"
  | "waiting"
  | "active"
  | "ended"
  | "closed";
export type PendingResolution =
  | "r5_beyond_total_limit"
  | "late_patient_left_before_doctor"
  | "late_patient_not_admitted"
  | "no_rule";

export interface SessionState {
  appointmentId: string;
  appointmentStatus: string;
  phase: SessionPhase;
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
  pendingResolution: PendingResolution | null;
}

export interface DoctorSessionSummary {
  appointmentId: string;
  scheduledAt: string;
  phase: "waiting" | "active";
  patientPresent: boolean;
  startedAt: string | null;
}

export interface DoctorAppointmentItem {
  id: string;
  status: string;
  scheduledAt: string;
  reason: string;
}

// Credencial del participante para el SDK del proveedor. Es individual y de este médico: nunca es la de la API.
export interface CallCredential {
  provider: string;
  authToken: string;
}

const doctorSession = (id: string) =>
  `/me/doctor/appointments/${encodeURIComponent(id)}/session`;

export async function listDoctorSessions(): Promise<DoctorSessionSummary[]> {
  return (
    await request<{ sessions: DoctorSessionSummary[] }>("/me/doctor/sessions")
  ).sessions;
}

export async function listDoctorAppointments(
  from: Date,
  to: Date,
): Promise<DoctorAppointmentItem[]> {
  const query = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  return (
    await request<{ appointments: DoctorAppointmentItem[] }>(
      `/me/doctor/appointments?${query}`,
    )
  ).appointments;
}

export function getDoctorSession(id: string): Promise<SessionState> {
  return request(doctorSession(id));
}

const sessionAction = (
  id: string,
  action: "enter" | "presence" | "leave" | "admit" | "end",
) =>
  request<SessionState>(`${doctorSession(id)}/${action}`, { method: "POST" });

export const enterDoctorSession = (id: string) => sessionAction(id, "enter");
export const sendDoctorPresence = (id: string) => sessionAction(id, "presence");
export const leaveDoctorSession = (id: string) => sessionAction(id, "leave");
export const admitPatient = (id: string) => sessionAction(id, "admit");
export const endConsultation = (id: string) => sessionAction(id, "end");

export function getDoctorCallCredential(id: string): Promise<CallCredential> {
  return request(`${doctorSession(id)}/token`, { method: "POST" });
}

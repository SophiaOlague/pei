// Rutas del panel administrativo (solo web). Las secciones futuras (especialidades, usuarios, auditoría) se
// agregarán aquí y en ADMIN_NAV cuando existan sus pantallas.
export { ADMIN_HOME_PATH } from "@/features/components/require-registration";
export const ADMIN_PROFESSIONALS_PATH = "/admin/profesionales";
// M08 (AP-10): administración del precio global de consulta.
export const ADMIN_CONSULTATION_PRICE_PATH = "/admin/precio-consulta";
export const adminDoctorPath = (doctorProfileId: string) =>
  `${ADMIN_PROFESSIONALS_PATH}/${encodeURIComponent(doctorProfileId)}`;
// RF-07: verificación de identidad (INE) de pacientes.
export const ADMIN_PATIENT_IDENTITY_PATH = "/admin/identidad-pacientes";
export const adminPatientIdentityPath = (requestId: string) =>
  `${ADMIN_PATIENT_IDENTITY_PATH}/${encodeURIComponent(requestId)}`;

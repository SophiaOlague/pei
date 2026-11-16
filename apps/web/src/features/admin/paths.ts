// Rutas del panel administrativo (solo web). Las secciones futuras (especialidades, usuarios, auditoría) se
// agregarán aquí y en ADMIN_NAV cuando existan sus pantallas.
export { ADMIN_HOME_PATH } from "@/features/components/require-registration";
export const ADMIN_PROFESSIONALS_PATH = "/admin/profesionales";
// M08 (AP-10): administración del precio global de consulta.
export const ADMIN_CONSULTATION_PRICE_PATH = "/admin/precio-consulta";
export const adminDoctorPath = (doctorProfileId: string) =>
  `${ADMIN_PROFESSIONALS_PATH}/${encodeURIComponent(doctorProfileId)}`;

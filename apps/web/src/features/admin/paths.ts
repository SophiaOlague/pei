// Rutas del panel administrativo (solo web). Las secciones futuras (especialidades, usuarios, auditoría) se
// agregarán aquí y en ADMIN_NAV cuando existan sus pantallas.
export { ADMIN_HOME_PATH } from "@/features/components/require-registration";
export const ADMIN_PROFESSIONALS_PATH = "/admin/profesionales";
export const adminDoctorPath = (doctorProfileId: string) =>
  `${ADMIN_PROFESSIONALS_PATH}/${encodeURIComponent(doctorProfileId)}`;

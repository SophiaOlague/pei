// Comprobaciones puras del recorrido de documentos del admin (doctor-documents.flow-spec.ts). Sin BD ni red: se prueban
// en documents-checks.spec.ts dentro de la suite unitaria.

// Eventos que deja el recorrido sobre el MÉDICO DE PRUEBA EXISTENTE, en orden de acción:
// - del médico: dos reenvíos de INE (intentos 2 y 3), un reenvío de cédula (mismo número: license_document_changed,
//   sin license_number.changed) y una vuelta a pending (approved → pending con el primer reenvío, identity_resubmitted);
// - del admin: tres lecturas de INE (frente y reverso de la 2, frente de la 3), tres de cédula (la 2 sin objeto, D6, y
//   la 3 dos veces, D5 y P9), el rechazo de la INE 2 y la aprobación de la INE 3.
// Sin `registration.completed` (ya estaba completo) ni eventos de la purga (no audita).
export const EXPECTED_DOCUMENTS_AUDIT = Object.freeze([
  'doctor.identity_document.viewed',
  'doctor.identity_document.viewed',
  'doctor.identity_document.viewed',
  'doctor.identity_verification.approved',
  'doctor.identity_verification.rejected',
  'doctor.identity_verification.submitted',
  'doctor.identity_verification.submitted',
  'doctor.license_document.viewed',
  'doctor.license_document.viewed',
  'doctor.license_document.viewed',
  'doctor.license_verification.submitted',
  'doctor.status.returned_to_pending',
]);
export const DOCUMENTS_AUDIT_BY_ADMIN = Object.freeze([
  'doctor.identity_document.viewed',
  'doctor.license_document.viewed',
  'doctor.identity_verification.approved',
  'doctor.identity_verification.rejected',
]);

// Estado del médico de prueba en cada etapa (Z-1; canOperate de GET /me). La cédula 3 queda pendiente al final.
export const EXPECTED_DOCUMENT_STATES = Object.freeze({
  inicial: { status: 'approved', identity: 'approved', professional: 'approved', canOperate: true },
  tras_reenvios: { status: 'pending', identity: 'pending', professional: 'pending', canOperate: false },
  tras_rechazo: { status: 'pending', identity: 'rejected', professional: 'pending', canOperate: false },
  final: { status: 'pending', identity: 'approved', professional: 'pending', canOperate: false },
});
export type DocumentStage = keyof typeof EXPECTED_DOCUMENT_STATES;

export function documentStateFailures(stage: DocumentStage, observed: Record<string, unknown>): string[] {
  const expected = EXPECTED_DOCUMENT_STATES[stage] as Record<string, unknown>;
  return Object.keys(expected).filter((k) => observed?.[k] !== expected[k]).map((k) => `${stage}: ${k} no es ${String(expected[k])}`);
}

export type Headers = Record<string, string | string[] | undefined>;
const header = (h: Headers, name: string) => {
  const v = h[name.toLowerCase()];
  return Array.isArray(v) ? v.join(',') : v;
};

// H.3: imagen en línea; nunca en caché ni interpretada con otro tipo.
export function imageHeaderFailures(h: Headers, contentType: string): string[] {
  const f: string[] = [];
  if (header(h, 'content-type')?.split(';')[0] !== contentType) f.push(`content-type no es ${contentType}`);
  if (header(h, 'cache-control') !== 'no-store') f.push('cache-control no es no-store');
  if (header(h, 'x-content-type-options') !== 'nosniff') f.push('falta nosniff');
  if (/attachment/.test(header(h, 'content-disposition') ?? '')) f.push('la imagen no va en línea');
  return f;
}

// H.3: PDF como attachment con CSP sandbox; tampoco en caché.
export function pdfHeaderFailures(h: Headers): string[] {
  const f: string[] = [];
  if (header(h, 'content-type')?.split(';')[0] !== 'application/pdf') f.push('content-type no es application/pdf');
  if (!(header(h, 'content-disposition') ?? '').startsWith('attachment')) f.push('el PDF no va como attachment');
  if (header(h, 'content-security-policy') !== 'sandbox') f.push('falta CSP sandbox');
  if (header(h, 'cache-control') !== 'no-store') f.push('cache-control no es no-store');
  if (header(h, 'x-content-type-options') !== 'nosniff') f.push('falta nosniff');
  return f;
}

// Ninguna cabecera ni cuerpo debe exponer claves de objetos, URLs de R2 ni firmas.
export function exposesStorageDetails(value: unknown): boolean {
  return /doctor-(identity|licenses|photos)\/|identity\/[0-9a-f]{8}-|X-Amz-|r2\.cloudflarestorage\.com/.test(
    typeof value === 'string' ? value : JSON.stringify(value ?? null),
  );
}

// Las claves borradas del almacén en memoria deben ser exactamente las de las INE de la ejecución.
export function unexpectedDeletions(deleted: readonly string[], expected: readonly string[]): string[] {
  const extra = deleted.filter((k) => !expected.includes(k));
  const missing = expected.filter((k) => !deleted.includes(k));
  return [...extra.map((k) => `borrada de más: ${k.split('/')[0]}`), ...missing.map((k) => `no borrada: ${k.split('/')[0]}`)];
}

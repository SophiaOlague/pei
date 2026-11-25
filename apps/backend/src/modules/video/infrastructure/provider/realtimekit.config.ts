// Configuración de Cloudflare RealtimeKit (proveedor de video). Se lee del entorno del proceso, igual que Stripe, R2 y
// Resend (loadXConfig(env)). Ningún mensaje incluye el token de la API ni parte de él.
//
// Variables (solo backend; nunca versionadas):
//   CLOUDFLARE_ACCOUNT_ID                 id de la cuenta de Cloudflare (32 caracteres hexadecimales)
//   CLOUDFLARE_REALTIME_APP_ID            id de la aplicación de RealtimeKit
//   CLOUDFLARE_API_TOKEN                  token de la API con permiso «Realtime» o «Realtime Admin»
//   CLOUDFLARE_REALTIME_PRESET_DOCTOR     nombre de un preset existente en la aplicación para el médico
//   CLOUDFLARE_REALTIME_PRESET_PATIENT    nombre de un preset existente en la aplicación para el paciente
//   CLOUDFLARE_REALTIME_TIMEOUT_MS        tiempo máximo de cada llamada a Cloudflare (entero 1000–30000). Vacía: 8000
//
// Los presets no tienen valor por omisión: los elige la persona responsable entre los que existen en la aplicación.
// Sin ninguna variable, el módulo arranca sin proveedor (la credencial de la llamada falla cerrada). Una configuración
// parcial o con formato inválido también deja el proveedor sin configurar (ver video.module.ts).

export interface RealtimeKitSettings {
  accountId: string;
  appId: string;
  apiToken: string;
  presets: { doctor: string; patient: string };
  timeoutMs: number;
}

export const REALTIMEKIT_ENV_KEYS = [
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_REALTIME_APP_ID',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_REALTIME_PRESET_DOCTOR',
  'CLOUDFLARE_REALTIME_PRESET_PATIENT',
] as const;
export const REALTIMEKIT_DEFAULT_TIMEOUT_MS = 8000;

const ACCOUNT_ID_FORMAT = /^[0-9a-f]{32}$/i;
const APP_ID_FORMAT = /^[A-Za-z0-9-]{8,64}$/;
const PRESET_FORMAT = /^[A-Za-z0-9_-]{1,100}$/;

export class RealtimeKitConfigError extends Error {
  constructor(reason: string) {
    super(`Configuración de RealtimeKit inválida: ${reason}`);
    this.name = 'RealtimeKitConfigError';
  }
}

// null: RealtimeKit no está configurado. Lanza RealtimeKitConfigError ante una configuración parcial o inválida.
export function loadRealtimeKitConfig(env: NodeJS.ProcessEnv = process.env): RealtimeKitSettings | null {
  const value = (key: string) => (env[key] ?? '').trim();
  const present = REALTIMEKIT_ENV_KEYS.filter((key) => value(key) !== '');
  if (present.length === 0) return null;
  const missing = REALTIMEKIT_ENV_KEYS.filter((key) => value(key) === '');
  if (missing.length > 0) throw new RealtimeKitConfigError(`faltan ${missing.join(', ')}`);

  const accountId = value('CLOUDFLARE_ACCOUNT_ID');
  const appId = value('CLOUDFLARE_REALTIME_APP_ID');
  const apiToken = value('CLOUDFLARE_API_TOKEN');
  const doctor = value('CLOUDFLARE_REALTIME_PRESET_DOCTOR');
  const patient = value('CLOUDFLARE_REALTIME_PRESET_PATIENT');
  if (!ACCOUNT_ID_FORMAT.test(accountId)) throw new RealtimeKitConfigError('CLOUDFLARE_ACCOUNT_ID debe tener 32 caracteres hexadecimales');
  if (!APP_ID_FORMAT.test(appId)) throw new RealtimeKitConfigError('CLOUDFLARE_REALTIME_APP_ID no tiene un formato válido');
  if (/\s/.test(apiToken)) throw new RealtimeKitConfigError('CLOUDFLARE_API_TOKEN contiene espacios');
  for (const [key, preset] of [['CLOUDFLARE_REALTIME_PRESET_DOCTOR', doctor], ['CLOUDFLARE_REALTIME_PRESET_PATIENT', patient]] as const) {
    if (!PRESET_FORMAT.test(preset)) throw new RealtimeKitConfigError(`${key} no es un nombre de preset válido`);
  }
  if (doctor === patient) throw new RealtimeKitConfigError('el médico y el paciente deben usar presets distintos');

  const rawTimeout = (env.CLOUDFLARE_REALTIME_TIMEOUT_MS ?? '').trim();
  let timeoutMs = REALTIMEKIT_DEFAULT_TIMEOUT_MS;
  if (rawTimeout !== '') {
    if (!/^\d+$/.test(rawTimeout)) throw new RealtimeKitConfigError('CLOUDFLARE_REALTIME_TIMEOUT_MS debe ser un entero');
    timeoutMs = Number(rawTimeout);
    if (timeoutMs < 1000 || timeoutMs > 30000) throw new RealtimeKitConfigError('CLOUDFLARE_REALTIME_TIMEOUT_MS debe estar entre 1000 y 30000');
  }
  return { accountId, appId, apiToken, presets: { doctor, patient }, timeoutMs };
}

import { memoryAdapter } from 'better-auth/adapters/memory';
import { createEmailVerificationToken } from 'better-auth/api';
import type { AuthEmail, EmailSender } from '../modules/identity/application/ports/email-sender';
import { AUTH_RATE_LIMIT, createAuth, VERIFICATION_REQUIRES_PASSWORD } from './auth.config';

// B2 (TC-M02-245): rechazo de un callbackURL no confiable, con la comprobación de orígenes de Better Auth ACTIVA.
//
// Better Auth desactiva originCheck en pruebas: @better-auth/core/env fija isTest() al cargarse (NODE_ENV === 'test',
// que Jest define) y create-context usa skipOriginCheck = isTest(). Para probarla de verdad, esta suite carga una
// instancia NUEVA de better-auth y de createAuth en un registro de módulos aislado con NODE_ENV=development, y
// comprueba primero que en esa instancia skipOriginCheck es false (si no, falla: nunca se omite en silencio).
// Better Auth real con el adaptador en memoria y un EmailSender falso: sin base de datos y sin correos reales.

const BACKEND = 'http://localhost:3000';
const WEB = 'http://localhost:3001';
const UNTRUSTED = 'https://malicioso.example.test/completar-registro';
const ADMIN = 'admin@example.test';
const PATIENT = 'paciente@example.test';
const SECRET = 'secreto-solo-para-pruebas-unitarias-de-pei-0123456789';

type MemoryData = { user: any[]; session: any[]; account: any[]; verification: any[] };
type Auth = ReturnType<typeof createAuth>;

class OutboxEmailSender implements EmailSender {
  outbox: AuthEmail[] = [];
  async send(email: AuthEmail): Promise<void> {
    this.outbox.push(email);
  }
  last(kind: AuthEmail['kind'], to: string): AuthEmail {
    const found = this.outbox.filter((m) => m.kind === kind && m.to === to).at(-1);
    if (!found) throw new Error(`sin correo ${kind} para ${to}`);
    return found;
  }
}

const RELAXED_RATE_LIMIT = {
  window: 60,
  max: 1000,
  customRules: Object.fromEntries(Object.keys(AUTH_RATE_LIMIT.customRules).map((path) => [path, { window: 60, max: 1000 }])),
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

function options(data: MemoryData, emailSender: EmailSender) {
  return {
    database: memoryAdapter(data),
    emailSender,
    config: { baseURL: BACKEND, secret: SECRET, trustedOrigins: [WEB] },
    rateLimit: RELAXED_RATE_LIMIT,
  };
}

// Instancia de Better Auth con originCheck activo (NODE_ENV distinto de 'test' al cargar sus módulos).
async function authWithOriginCheck(data: MemoryData, emailSender: EmailSender): Promise<Auth> {
  const previous = process.env.NODE_ENV;
  let auth: Auth | undefined;
  try {
    process.env.NODE_ENV = 'development';
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const isolated = require('./auth.config') as { createAuth: typeof createAuth };
      auth = isolated.createAuth(options(data, emailSender));
    });
  } finally {
    process.env.NODE_ENV = previous;
  }
  return auth!;
}

async function setup() {
  const data: MemoryData = { user: [], session: [], account: [], verification: [] };
  const emailSender = new OutboxEmailSender();
  const auth = await authWithOriginCheck(data, emailSender);
  const context = await auth.$context;
  const get = (url: string) => auth.handler(new Request(url));
  const post = async (path: string, body: object) => {
    const response = await auth.handler(
      new Request(`${BACKEND}/api/auth${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: WEB },
        body: JSON.stringify(body),
      }),
    );
    await flush();
    return response;
  };
  return { auth, context, data, emailSender, get, post };
}

const withCallback = (link: string, callbackURL: string) => {
  const url = new URL(link);
  url.searchParams.set('callbackURL', callbackURL);
  return url.toString();
};
const userOf = (data: MemoryData, email: string) => data.user.find((u) => u.email === email);
const sessionsOf = (data: MemoryData, email: string) => data.session.filter((s) => s.userId === userOf(data, email)?.id);

describe('Orígenes de confianza con originCheck activo (DT-10, DT-12)', () => {
  it('[TC-M02-245][DT-10] control: en Jest originCheck está desactivado; la instancia aislada lo tiene activo', async () => {
    const plain = createAuth(options({ user: [], session: [], account: [], verification: [] }, new OutboxEmailSender()));
    expect((await plain.$context).skipOriginCheck).toBe(true);

    const { context } = await setup();
    expect(context.skipOriginCheck).toBe(false);
  });

  it('[TC-M02-245][DT-12] enlace prematuro con callbackURL no confiable: 403 antes del bloqueo, sin redirigir a ese origen, sin sesión ni verificación', async () => {
    const { context, data, emailSender, get } = await setup();
    expect(context.skipOriginCheck).toBe(false);
    // Cuenta sin contraseña (como la deja el bootstrap) y un enlace de verificación válido firmado con el secreto.
    await context.internalAdapter.createUser({ email: ADMIN, name: 'Admin', emailVerified: false }, { method: 'admin' });
    const token = await createEmailVerificationToken(SECRET, ADMIN, undefined, 3600);
    const link = `${BACKEND}/api/auth/verify-email?token=${token}`;

    const untrusted = await get(withCallback(link, UNTRUSTED));
    expect(untrusted.status).toBe(403);
    expect((await untrusted.json()).code).toBe('INVALID_CALLBACK_URL');
    expect(untrusted.headers.get('location')).toBeNull();
    expect(untrusted.headers.get('set-cookie')).toBeNull();
    expect(sessionsOf(data, ADMIN)).toEqual([]);
    expect(userOf(data, ADMIN).emailVerified).toBe(false);

    // El mismo enlace con un origen de confianza llega al bloqueo, que vuelve al cliente web con el error.
    const trusted = await get(withCallback(link, `${WEB}/completar-registro`));
    expect(trusted.status).toBe(302);
    const location = new URL(trusted.headers.get('location')!);
    expect(location.origin).toBe(WEB);
    expect(location.searchParams.get('error')).toBe(VERIFICATION_REQUIRES_PASSWORD);
    expect(sessionsOf(data, ADMIN)).toEqual([]);
    expect(userOf(data, ADMIN).emailVerified).toBe(false);
    expect(emailSender.outbox).toEqual([]);
  });

  it('[TC-M02-245][DT-10] /send-verification-email con callbackURL no confiable: 403 y ningún correo', async () => {
    const { context, emailSender, post } = await setup();
    await context.internalAdapter.createUser({ email: ADMIN, name: 'Admin', emailVerified: false }, { method: 'admin' });

    const response = await post('/send-verification-email', { email: ADMIN, callbackURL: UNTRUSTED });
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('INVALID_CALLBACK_URL');
    expect(emailSender.outbox).toEqual([]);
  });

  it('[TC-M02-245][DP-2] paciente: un callbackURL no confiable se rechaza sin sesión; con uno de confianza verifica e inicia sesión', async () => {
    const { data, emailSender, get, post } = await setup();
    const signUp = await post('/sign-up/email', { email: PATIENT, password: 'Contrasena-Sintetica-1', name: 'Paciente', callbackURL: `${WEB}/completar-registro` });
    expect(signUp.status).toBe(200);
    const link = emailSender.last('email_verification', PATIENT).url;

    const untrusted = await get(withCallback(link, UNTRUSTED));
    expect(untrusted.status).toBe(403);
    expect(untrusted.headers.get('location')).toBeNull();
    expect(sessionsOf(data, PATIENT)).toEqual([]);
    expect(userOf(data, PATIENT).emailVerified).toBe(false);

    const trusted = await get(link);
    expect(trusted.status).toBe(302);
    expect(trusted.headers.get('location')).toBe(`${WEB}/completar-registro`);
    expect(sessionsOf(data, PATIENT)).toHaveLength(1);
    expect(userOf(data, PATIENT).emailVerified).toBe(true);
  });

  it('[TC-M02-245][DT-10] /sign-up/email con callbackURL no confiable: 403 sin crear la cuenta', async () => {
    const { data, emailSender, post } = await setup();
    const response = await post('/sign-up/email', { email: PATIENT, password: 'Contrasena-Sintetica-1', name: 'Paciente', callbackURL: UNTRUSTED });
    expect(response.status).toBe(403);
    expect(userOf(data, PATIENT)).toBeUndefined();
    expect(emailSender.outbox).toEqual([]);
  });
});

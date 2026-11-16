import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sql } from 'drizzle-orm';
import { assertC2BranchTarget } from '../support/c2-target-guard';
import { C2_TARGET } from '../support/c2-target-guard';
import { db } from '../../src/db';
import * as schema from '../../src/db/schema';
import { getDbContext } from '../../src/db/transaction-context';
import { AUTH_RATE_LIMIT, createAuth, VERIFICATION_REQUIRES_PASSWORD } from '../../src/auth/auth.config';
import { EmailDispatchRegistry } from '../../src/auth/email-dispatches';
import { DrizzleUnitOfWork } from '../../src/common/infrastructure/drizzle-unit-of-work';
import { DrizzleAuditTrail } from '../../src/modules/audit/infrastructure/drizzle-audit-trail';
import type { AuthEmail, EmailSender } from '../../src/modules/identity/application/ports/email-sender';
import { BootstrapAdminUseCase } from '../../src/modules/identity/application/use-cases/bootstrap-admin.use-case';
import { AdminAlreadyExistsError, BootstrapAccountHasCredentialError } from '../../src/modules/identity/domain/identity.errors';
import { BetterAuthAdminAccountProvisioner } from '../../src/modules/identity/infrastructure/auth/better-auth-admin-account.provisioner';
import { DrizzleUserProfileRepository } from '../../src/modules/identity/infrastructure/persistence/drizzle-user-profile.repository';
import { captureError, TEST_EMAIL_DOMAIN, testTag, withRollback, type Tx } from '../support/with-rollback';

// Integración del primer administrador (DT-12, opción C) con el esquema REAL de Drizzle: Better Auth sobre la
// transacción de la prueba (drizzleAdapter(tx): sus escrituras son SAVEPOINTs dentro de ella) y los repositorios
// Drizzle de PEI. Todo se revierte (withRollback). EmailSender falso: sin correos. Sin R2.
//
// SOLO contra la rama temporal mediante C2: la salvaguarda falla antes de cualquier consulta si falta la identidad
// esperada, si DATABASE_URL no es la de esa rama o si Resend/R2 no están neutralizados.
assertC2BranchTarget();

const BACKEND = 'http://localhost:3000';
const WEB = 'http://localhost:3001';
const PASSWORD = 'Contrasena-Admin-2026';

class OutboxEmailSender implements EmailSender {
  outbox: AuthEmail[] = [];
  async send(email: AuthEmail): Promise<void> {
    this.outbox.push(email);
  }
  last(kind: AuthEmail['kind'], to: string): AuthEmail {
    const found = this.outbox.filter((m) => m.kind === kind && m.to === to).at(-1);
    if (!found) throw new Error(`sin correo ${kind}`);
    return found;
  }
}

const RELAXED_RATE_LIMIT = {
  window: 60,
  max: 1000,
  customRules: Object.fromEntries(Object.keys(AUTH_RATE_LIMIT.customRules).map((path) => [path, { window: 60, max: 1000 }])),
};

const flush = () => new Promise((resolve) => setImmediate(resolve));
// Correo sintético único por fixture: testTag() incluye C2_RUN_ID cuando lo define el lanzador
// (gst-m00-test-<C2_RUN_ID>-<uuid>-<etiqueta>@m00.test.invalid).
const testEmail = (label: string) => `${testTag()}-${label}@${TEST_EMAIL_DOMAIN}`;

// La rama C2 persistente (C2_TARGET) conserva un administrador copiado de la base de desarrollo: el bootstrap
// INICIAL (sin ningún administrador) no es aplicable allí y sus dos escenarios quedan pendientes para una rama sin
// administradores. No se eliminan ni se sustituyen; el escenario «ya existe un administrador» valida en C2 el
// comportamiento real.
const IN_C2_WITH_ADMIN = process.env.C2_EXPECTED_BRANCH === C2_TARGET.branch;
const itInitialBootstrap = IN_C2_WITH_ADMIN ? it.skip : it;
const PENDING_IN_C2 = '[pendiente en C2: la rama ya tiene administrador]';

// Cada fixture usa un correo nuevo: si ya existiera (colisión con un usuario preexistente), la prueba se detiene.
async function freshEmail(label: string): Promise<string> {
  const email = testEmail(label);
  const { rows } = await getDbContext().execute<{ n: number }>(sql`select count(*)::int as n from "user" where email = ${email}`);
  if (rows[0].n !== 0) throw new Error('colisión del correo sintético con un usuario existente');
  return email;
}

function setup(tx: Tx) {
  const emailSender = new OutboxEmailSender();
  const registry = new EmailDispatchRegistry();
  registry.record();
  const auth = createAuth({
    database: drizzleAdapter(tx as any, {
      provider: 'pg',
      schema: { user: schema.user, account: schema.account, session: schema.session, verification: schema.verification },
    }),
    emailSender,
    config: { baseURL: BACKEND, secret: 'secreto-solo-para-pruebas-de-integracion-de-pei-0123456789', trustedOrigins: [WEB] },
    rateLimit: RELAXED_RATE_LIMIT,
    emailDispatches: registry,
  });
  const provisioner = new BetterAuthAdminAccountProvisioner(auth);
  const userProfiles = new DrizzleUserProfileRepository();
  const useCase = new BootstrapAdminUseCase(new DrizzleUnitOfWork(), new DrizzleAuditTrail(), userProfiles, provisioner);
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
  const get = (url: string) => auth.handler(new Request(url));
  return { auth, emailSender, registry, provisioner, userProfiles, useCase, post, get };
}

async function userRow(email: string) {
  const { rows } = await getDbContext().execute<{ id: string; email: string; email_verified: boolean }>(
    sql`select id, email, email_verified from "user" where email = ${email}`,
  );
  return rows[0];
}
async function countFor(table: 'account' | 'session', userId: string) {
  const { rows } =
    table === 'account'
      ? await getDbContext().execute<{ n: number }>(sql`select count(*)::int as n from account where user_id = ${userId} and provider_id = 'credential'`)
      : await getDbContext().execute<{ n: number }>(sql`select count(*)::int as n from session where user_id = ${userId}`);
  return rows[0].n;
}

// Huella de solo lectura (fuera de las transacciones de prueba): debe ser idéntica antes y después.
async function fingerprint() {
  const { rows } = await db.execute<Record<string, number>>(sql`
    select
      (select count(*) from "user")::int as users,
      (select count(*) from account)::int as accounts,
      (select count(*) from session)::int as sessions,
      (select count(*) from verification)::int as verifications,
      (select count(*) from user_profile)::int as user_profiles,
      (select count(*) from user_profile where role = 'admin')::int as admins,
      (select count(*) from audit_log)::int as audit_log,
      (select count(*) from "user" where email like ${'%@' + TEST_EMAIL_DOMAIN})::int as test_users,
      (select count(*) from legal_document)::int as legal_documents
  `);
  return rows[0];
}

// Recuentos dentro de la transacción de la prueba (para comprobar que un caso no creó nada).
async function txCounts() {
  const { rows } = await getDbContext().execute<Record<string, number>>(sql`
    select (select count(*) from "user")::int as users, (select count(*) from account)::int as accounts,
           (select count(*) from session)::int as sessions, (select count(*) from verification)::int as verifications,
           (select count(*) from user_profile)::int as user_profiles, (select count(*) from audit_log)::int as audit_log`);
  return rows[0];
}

describe('Primer administrador con Better Auth y el esquema real (DT-12, opción C)', () => {
  let before: Record<string, number>;

  beforeAll(async () => {
    // Sin precondiciones sobre el contenido de la rama (la C2 persistente conserva administradores y usuarios
    // sintéticos): la huella solo se compara antes y después para demostrar el rollback.
    before = await fingerprint();
    if (IN_C2_WITH_ADMIN) expect(before.admins).toBeGreaterThan(0);
  });

  afterAll(async () => {
    try {
      expect(await fingerprint()).toEqual(before);
    } finally {
      await db.$client.end();
      expect(db.$client.totalCount).toBe(0);
    }
  });

  it('[TC-M02-118][DT-12] createAccount: solo la fila user (email_verified=false, correo en minúsculas), sin credencial', async () => {
    await withRollback(async (tx) => {
      const { provisioner } = setup(tx);
      const email = await freshEmail('admin');
      const userId = await provisioner.createAccount({ email: email.toUpperCase(), name: 'Admin Inicial' });

      expect(await userRow(email)).toEqual({ id: userId, email, email_verified: false });
      expect(await countFor('account', userId)).toBe(0);
      expect(await countFor('session', userId)).toBe(0);
      expect(await provisioner.hasPasswordCredential(userId)).toBe(false);
    });
  });

  it('[TC-M02-118][DT-12] un segundo createAccount con el mismo correo viola user.email unique', async () => {
    await withRollback(async (tx) => {
      const { provisioner } = setup(tx);
      const email = await freshEmail('admin');
      await provisioner.createAccount({ email, name: 'Admin Inicial' });
      // Última operación de la transacción: el error la invalida y withRollback la revierte.
      expect(await captureError(provisioner.createAccount({ email, name: 'Otra' }))).toBeInstanceOf(Error);
    });
  });

  it('[TC-M02-119][DT-12] recorrido: contraseña → credencial sin sesión; inicio de sesión 403 + verificación; verificar → sesión y email_verified', async () => {
    process.env.APP_WEB_URL = WEB;
    try {
      await withRollback(async (tx) => {
        const { emailSender, provisioner, post, get } = setup(tx);
        const email = await freshEmail('admin');
        const userId = await provisioner.createAccount({ email, name: 'Admin Inicial' });

        await provisioner.sendPasswordSetup(email);
        await flush();
        const token = new URL(emailSender.last('password_reset', email).url).pathname.split('/').at(-1)!;
        expect((await post('/reset-password', { token, newPassword: PASSWORD })).status).toBe(200);
        expect(await countFor('account', userId)).toBe(1);
        expect(await countFor('session', userId)).toBe(0);
        expect((await userRow(email)).email_verified).toBe(false);

        const signIn = await post('/sign-in/email', { email, password: PASSWORD, callbackURL: `${WEB}/completar-registro` });
        expect(signIn.status).toBe(403);
        expect(await countFor('session', userId)).toBe(0);

        const verified = await get(emailSender.last('email_verification', email).url);
        expect(verified.status).toBe(302);
        expect(verified.headers.get('location')).toBe(`${WEB}/completar-registro`);
        expect((await userRow(email)).email_verified).toBe(true);
        expect(await countFor('session', userId)).toBe(1);
      });
    } finally {
      delete process.env.APP_WEB_URL;
    }
  });

  it('[TC-M02-120][DT-12] enlace prematuro con el esquema real: rechazo sin fila session ni email_verified', async () => {
    await withRollback(async (tx) => {
      const { emailSender, provisioner, post, get } = setup(tx);
      const email = await freshEmail('admin');
      const userId = await provisioner.createAccount({ email, name: 'Admin Inicial' });
      expect((await post('/send-verification-email', { email, callbackURL: `${WEB}/completar-registro` })).status).toBe(200);

      const response = await get(emailSender.last('email_verification', email).url);
      expect(response.status).toBe(302);
      expect(new URL(response.headers.get('location')!).searchParams.get('error')).toBe(VERIFICATION_REQUIRES_PASSWORD);
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(await countFor('session', userId)).toBe(0);
      expect((await userRow(email)).email_verified).toBe(false);
    });
  });

  itInitialBootstrap(`[TC-M02-121][DT-12] caso de uso con Drizzle: perfil admin y auditoría, un solo correo; repetir aborta${IN_C2_WITH_ADMIN ? ` ${PENDING_IN_C2}` : ''}`, async () => {
    process.env.APP_WEB_URL = WEB;
    try {
      await withRollback(async (tx) => {
        const { registry, useCase, userProfiles } = setup(tx);
        const email = await freshEmail('admin');

        const { userProfileId, resumedExistingAccount } = await useCase.execute({ email, firstName: 'Admin', lastName: 'Inicial' });
        expect(resumedExistingAccount).toBe(false);
        expect(await userProfiles.adminExists()).toBe(true);
        const { rows } = await getDbContext().execute<{ action: string }>(
          sql`select action from audit_log where entity_id = ${userProfileId}`,
        );
        expect(rows.map((r) => r.action)).toEqual(['identity.admin.bootstrapped']);
        expect(await registry.settle()).toEqual([{ kind: 'password_reset', ok: true }]);

        expect(await captureError(useCase.execute({ email: testEmail('otro'), firstName: 'Otro', lastName: 'Admin' }))).toBeInstanceOf(
          AdminAlreadyExistsError,
        );
      });
    } finally {
      delete process.env.APP_WEB_URL;
    }
  });

  itInitialBootstrap(`[TC-M02-121][DT-12] H1 con el esquema real: una cuenta del registro público (con contraseña) hace abortar el bootstrap sin perfil admin${IN_C2_WITH_ADMIN ? ` ${PENDING_IN_C2}` : ''}`, async () => {
    process.env.APP_WEB_URL = WEB;
    try {
      await withRollback(async (tx) => {
        const { registry, useCase, userProfiles, post } = setup(tx);
        const email = await freshEmail('admin');
        expect((await post('/sign-up/email', { email, password: 'Contrasena-De-Otra-Persona-1', name: 'Otra persona' })).status).toBe(200);

        expect(await captureError(useCase.execute({ email, firstName: 'Admin', lastName: 'Inicial' }))).toBeInstanceOf(
          BootstrapAccountHasCredentialError,
        );
        expect(await userProfiles.adminExists()).toBe(false);
        expect((await registry.settle()).map((o) => o.kind)).toEqual(['email_verification']); // solo la del registro
      });
    } finally {
      delete process.env.APP_WEB_URL;
    }
  });

  it('[TC-M03-293][DT-12] con un administrador existente, el bootstrap aborta con AdminAlreadyExistsError sin crear nada', async () => {
    process.env.APP_WEB_URL = WEB;
    try {
      await withRollback(async (tx) => {
        const { registry, useCase, userProfiles } = setup(tx);
        expect(await userProfiles.adminExists()).toBe(true);
        const email = await freshEmail('admin-existente');
        const counts = await txCounts();
        expect(await captureError(useCase.execute({ email, firstName: 'Admin', lastName: 'Sintetico' }))).toBeInstanceOf(AdminAlreadyExistsError);
        expect(await txCounts()).toEqual(counts);
        expect((await userRow(email)) === undefined).toBe(true);
        expect(await registry.settle()).toEqual([]);
      });
    } finally {
      delete process.env.APP_WEB_URL;
    }
  });
});

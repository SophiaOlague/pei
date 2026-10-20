import { FLOW_TARGET as TARGET } from './flow-guard'; // primero: falla antes de cargar el backend fuera de C2
import { randomBytes, randomInt, randomUUID } from 'crypto';
import type { AddressInfo } from 'net';
import { INestApplication, type LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { db } from '../../src/db';
import { DomainExceptionFilter } from '../../src/common/filters/domain-exception.filter';
import { createValidationPipe } from '../../src/common/validation/create-validation-pipe';
import { EMAIL_SENDER, type AuthEmail, type EmailSender } from '../../src/modules/identity/application/ports/email-sender';
import { PRIVATE_OBJECT_STORAGE } from '../../src/modules/private-storage/application/ports/private-object-storage';
import { FakeDocumentStorage } from '../support/identity-in-memory';
import { syntheticCurp, syntheticJpeg } from '../support/synthetic-identity';
import { registeredPendingFailures } from './flow-checks';

// M03: recorrido de REGISTRO DE UN MÉDICO DE PRUEBA por HTTP contra la rama Neon `m03-flujo-medicos`, con el AppModule
// real (Drizzle, Better Auth, UnitOfWork y auditoría reales). Solo se sustituyen el almacén privado (en memoria: nada a
// R2) y el envío de correos (captura el enlace en memoria: nada a Resend). Los datos se CONFIRMAN y son permanentes.
//
// Solo se ejecuta mediante C2 (flujo-registro.cjs), con su config propia (test/flujo/jest-flujo.json), nunca en las
// suites. Fuera de la rama fijada falla al cargar, antes de cualquier conexión (más el db-tripwire de setupFiles).
// Nunca imprime correos, contraseñas, tokens, enlaces ni datos de otras cuentas: solo FLUJO_RESULT con ids y estados.
const ORIGIN = 'http://localhost:3000';
const TEST_DOMAIN = 'm00.test.invalid';
const PDF = Buffer.from('%PDF-1.7\n% documento sintetico M03 flujo de registro\n');

class CapturingEmailSender implements EmailSender {
  readonly sent: AuthEmail[] = [];
  async send(email: AuthEmail): Promise<void> {
    this.sent.push(email);
  }
}

// Logger que guarda los mensajes en memoria (nunca a la consola). Al final solo se informa cuántos hay y cuántos
// contienen un correo ajeno o una CURP distinta de la sintética.
class BufferLogger implements LoggerService {
  readonly lines: string[] = [];
  private push(level: string, message: unknown, ...rest: unknown[]) {
    this.lines.push(`${level} ${[message, ...rest].map((x) => (x instanceof Error ? `${x.name}: ${x.message}` : String(x))).join(' ')}`);
  }
  log(m: unknown, ...r: unknown[]) { this.push('log', m, ...r); }
  error(m: unknown, ...r: unknown[]) { this.push('error', m, ...r); }
  warn(m: unknown, ...r: unknown[]) { this.push('warn', m, ...r); }
  debug(m: unknown, ...r: unknown[]) { this.push('debug', m, ...r); }
  verbose(m: unknown, ...r: unknown[]) { this.push('verbose', m, ...r); }
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CURP_RE = /\b[A-Z][AEIOUX][A-Z]{2}\d{6}[HMX][A-Z]{5}[A-Z0-9]\d\b/g;
function foreignData(lines: string[], ownEmail: string, ownCurp: string): number {
  let n = 0;
  for (const line of lines) {
    n += (line.match(EMAIL_RE) ?? []).filter((e) => e !== ownEmail && !e.endsWith(`@${TEST_DOMAIN}`)).length;
    n += (line.match(CURP_RE) ?? []).filter((c) => c !== ownCurp).length;
  }
  return n;
}

// La conexión que de verdad escribe: el pool de src/db que usa el backend.
async function backendIdentity() {
  const { rows } = await db.execute<{ b: string; e: string; p: string; t: string }>(sql`
    select current_setting('neon.branch_id') as b, current_setting('neon.endpoint_id') as e,
           current_setting('neon.project_id') as p, current_setting('neon.timeline_id') as t`);
  const r = rows[0];
  const ok = r.b === TARGET.branch && r.e === TARGET.endpoint && r.p === TARGET.project && r.t.startsWith(TARGET.timeline);
  if (!ok) throw new Error('El pool del backend no está conectado a m03-flujo-medicos: se detiene');
  return { branch: r.b, endpoint: r.e, project: r.p, timelinePrefix: r.t.slice(0, 6) };
}

describe('M03: registro de un médico de prueba en m03-flujo-medicos (C2, datos confirmados)', () => {
  let app: INestApplication;
  let base: string;
  const mail = new CapturingEmailSender();
  const logger = new BufferLogger();
  const steps: { paso: string; http?: number; ok: boolean; identidad?: string }[] = [];
  const result: Record<string, unknown> = { pasos: steps };
  // Correo y CURP de la cuenta de prueba: solo para analizar los logs; nunca entran en FLUJO_RESULT.
  const own = { email: '', curp: '' };

  beforeAll(async () => {
    result.identidad_antes_de_arrancar = await backendIdentity();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PRIVATE_OBJECT_STORAGE).useValue(new FakeDocumentStorage())
      .overrideProvider(EMAIL_SENDER).useValue(mail)
      .compile();
    app = moduleRef.createNestApplication({ bodyParser: false, logger });
    app.useGlobalFilters(new DomainExceptionFilter());
    app.useGlobalPipes(createValidationPipe());
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    if (address.address !== '127.0.0.1') throw new Error('El servidor no escucha solo en 127.0.0.1');
    base = `http://127.0.0.1:${address.port}`;
    result.identidad_tras_arrancar = await backendIdentity();
  });

  afterAll(async () => {
    await app?.close();
    result.logs = { lineas: logger.lines.length, datos_ajenos: foreignData(logger.lines, own.email, own.curp) };
    process.stdout.write(`\nFLUJO_RESULT ${JSON.stringify(result)}\n`);
    await db.$client.end();
  });

  // Antes de cada paso que escribe: la identidad del pool del backend, otra vez.
  async function guardedStep<T extends request.Response>(paso: string, expectedStatus: number, run: () => Promise<T>): Promise<T> {
    const id = await backendIdentity();
    const res = await run();
    const ok = res.status === expectedStatus;
    steps.push({ paso, http: res.status, ok, identidad: `${id.branch}/${id.timelinePrefix}` });
    if (!ok) throw new Error(`Paso ${paso}: HTTP ${res.status} (se esperaba ${expectedStatus}); se detiene`);
    return res;
  }

  it('[TC-M03-203][RF-05][D-32] recorre el registro completo del médico con los documentos legales TEST-1', async () => {
    const email = `m03-flujo-${randomUUID()}@${TEST_DOMAIN}`;
    const password = `${randomBytes(18).toString('base64url')}-Aa1`;
    const curp = syntheticCurp();
    own.email = email;
    own.curp = curp;
    const agent = request.agent(base);

    // 1. Lectura pública.
    const legal = await request(base).get('/legal-documents/current?audience=doctor');
    steps.push({ paso: '1 GET /legal-documents/current?audience=doctor', http: legal.status, ok: legal.status === 200 });
    expect(legal.status).toBe(200);
    const docs = (legal.body as { id: string; type: string; version: string }[]).map(({ id, type, version }) => ({ id, type, version }));
    result.documentos_legales = docs;
    expect(docs.map((d) => `${d.type}@${d.version}`).sort()).toEqual(['doctor_terms@TEST-1', 'privacy_policy@TEST-1']);

    // 3 y 4. Cuenta de Better Auth y verificación del correo (enlace capturado en memoria).
    await guardedStep('3 POST /api/auth/sign-up/email', 200, () =>
      request(base).post('/api/auth/sign-up/email').set('Origin', ORIGIN).send({ email, password, name: 'Prueba Flujo M03' }));
    await new Promise((r) => setTimeout(r, 200)); // el correo sale sin esperar la respuesta
    const link = mail.sent.find((m) => m.kind === 'email_verification' && m.to === email);
    expect(link).toBeDefined();
    const token = new URL(link!.url).searchParams.get('token');
    // Better Auth responde 200 (JSON) o 302 (con callbackURL); cualquiera de los dos verifica el correo.
    const id4 = await backendIdentity();
    const verified = await agent.get(`/api/auth/verify-email?token=${encodeURIComponent(token!)}`).set('Origin', ORIGIN).redirects(0).ok(() => true);
    const ok4 = verified.status === 200 || verified.status === 302;
    steps.push({ paso: '4 GET /api/auth/verify-email', http: verified.status, ok: ok4, identidad: `${id4.branch}/${id4.timelinePrefix}` });
    if (!ok4) throw new Error(`Paso 4: HTTP ${verified.status}; se detiene`);
    const session = await agent.get('/api/auth/get-session').set('Origin', ORIGIN);
    if (!session.body?.user?.id) {
      await guardedStep('4b POST /api/auth/sign-in/email', 200, () => agent.post('/api/auth/sign-in/email').set('Origin', ORIGIN).send({ email, password }));
    }
    const me0 = await agent.get('/api/auth/get-session').set('Origin', ORIGIN);
    expect(me0.body?.user?.emailVerified).toBe(true);
    result.user_id = me0.body.user.id;

    // 2. Especialidades activas: requieren sesión (SessionGuard), por eso van después de verificar el correo.
    const specialties = await agent.get('/specialties').set('Origin', ORIGIN);
    steps.push({ paso: '2 GET /specialties (con sesión)', http: specialties.status, ok: specialties.status === 200 });
    if (specialties.status !== 200) throw new Error(`Paso 2: HTTP ${specialties.status}; se detiene`);
    const specialty = (specialties.body as { id: string; code: string }[]).find((s) => s.code === 'medicina_general') ?? specialties.body[0];
    result.especialidad = { id: specialty.id, code: specialty.code };

    // 5. Perfil de médico.
    const profile = await guardedStep('5 POST /me/doctor-profile', 201, () =>
      agent.post('/me/doctor-profile').set('Origin', ORIGIN).send({ firstName: 'Prueba', lastName: 'Flujo M03', curp, specialtyId: specialty.id }));
    result.user_profile_id = profile.body.userProfileId;
    result.doctor_profile_id = profile.body.doctorProfileId;

    // 6. Aceptación de los dos documentos TEST-1 (antes de los envíos: el último envío completa el registro).
    const accepted = await guardedStep('6 POST /me/legal-acceptances', 201, () =>
      agent.post('/me/legal-acceptances').set('Origin', ORIGIN).send({ documentIds: docs.map((d) => d.id) }));
    result.aceptados = accepted.body.accepted;

    // 7 y 8. INE y cédula sintéticas (almacén en memoria).
    const ine = await guardedStep('7 POST /me/doctor/identity-verifications', 201, () =>
      agent.post('/me/doctor/identity-verifications').set('Origin', ORIGIN).attach('front', syntheticJpeg(256), 'f.jpg').attach('back', syntheticJpeg(256), 'b.jpg'));
    result.ine = { reviewId: ine.body.reviewId, attempt: ine.body.attempt };
    const lic = await guardedStep('8 POST /me/doctor/license-verifications', 201, () =>
      agent.post('/me/doctor/license-verifications').set('Origin', ORIGIN).field('licenseNumber', `TEST-${randomInt(10_000_000, 99_999_999)}`).attach('document', PDF, 'c.pdf'));
    result.cedula = { reviewId: lic.body.reviewId, attempt: lic.body.attempt, reason: lic.body.reason };

    // 9. Estado derivado.
    const status = await agent.get('/me/doctor/status').set('Origin', ORIGIN);
    steps.push({ paso: '9 GET /me/doctor/status', http: status.status, ok: status.status === 200 });
    const me = await agent.get('/me').set('Origin', ORIGIN);
    steps.push({ paso: '9 GET /me', http: me.status, ok: me.status === 200 });
    // canOperate no está en /me/doctor/status: lo añade GET /me (registrationStatus.canOperate).
    const { status: st, identity, professional, registrationComplete, missing } = status.body;
    result.estado = { status: st, identity, professional, registrationComplete, missing };
    result.me = { role: me.body.role, registrationStatus: me.body.registrationStatus && { status: me.body.registrationStatus.status, canOperate: me.body.registrationStatus.canOperate } };
    result.correos_capturados = mail.sent.map((m) => m.kind);
    result.identidad_al_terminar = await backendIdentity();

    expect(registeredPendingFailures(status.body, me.body)).toEqual([]);
  });
});

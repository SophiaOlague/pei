import { FLOW_TARGET as TARGET } from './flow-guard'; // primero: falla antes de cargar el backend fuera de C2
import { randomBytes, randomUUID } from 'crypto';
import type { AddressInfo } from 'net';
import { INestApplication, type LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { db } from '../../src/db';
import { transactionStorage } from '../../src/db/transaction-context';
import { DomainExceptionFilter } from '../../src/common/filters/domain-exception.filter';
import { createValidationPipe } from '../../src/common/validation/create-validation-pipe';
import { EMAIL_SENDER, type AuthEmail, type EmailSender } from '../../src/modules/identity/application/ports/email-sender';
import { PRIVATE_OBJECT_STORAGE } from '../../src/modules/private-storage/application/ports/private-object-storage';
import { DrizzleUserProfileRepository } from '../../src/modules/identity/infrastructure/persistence/drizzle-user-profile.repository';
import { FakeDocumentStorage } from '../support/identity-in-memory';
import { EXPECTED_STATES, exposesObjectKeys, stateFailures, type ReviewStage } from './review-checks';

// M03: REVISIÓN DEL ADMIN sobre el médico de prueba ya registrado en `m03-flujo-medicos` (doctor-registration.flow-spec),
// por HTTP con el AppModule real. Solo se sustituyen el almacén privado (en memoria) y el envío de correos (captura en
// memoria). Datos CONFIRMADOS y permanentes en la rama. Plan: PLAN-revision-admin.md de C2.
//
// - Admin de prueba: alta y verificación por HTTP y promoción directa con createAdmin (no hay endpoint, DT-12;
//   admin:bootstrap falla porque la rama ya tiene un admin). El admin heredado de production NUNCA se usa.
// - Médico de prueba: su contraseña nunca se guardó; se recupera el acceso con el flujo real de recuperación de
//   contraseña (enlace capturado en memoria). Better Auth revoca sus sesiones anteriores.
// - No se abren documentos (registraría `*_document.viewed` de objetos inexistentes).
//
// Solo mediante C2 (revision-admin.cjs). Nunca imprime correos, contraseñas, tokens ni enlaces: solo FLOW_RESULT.
const ORIGIN = 'http://localhost:3000';
const TEST_DOMAIN = 'm00.test.invalid';
const PDF = Buffer.from('%PDF-1.7\n% documento sintetico M03 reenvio de cedula\n');
const REJECTION_REASON = 'TEST: documento ilegible (prueba M03)';

class CapturingEmailSender implements EmailSender {
  readonly sent: AuthEmail[] = [];
  async send(email: AuthEmail): Promise<void> {
    this.sent.push(email);
  }
}

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
function foreignData(lines: string[]): number {
  let n = 0;
  for (const line of lines) {
    n += (line.match(EMAIL_RE) ?? []).filter((e) => !e.endsWith(`@${TEST_DOMAIN}`)).length;
    n += (line.match(CURP_RE) ?? []).filter((c) => !c.startsWith('X')).length;
  }
  return n;
}

const tokenFromUrl = (url: string) => { const u = new URL(url); return u.searchParams.get('token') ?? u.pathname.split('/').at(-1)!; };

async function backendIdentity() {
  const { rows } = await db.execute<{ b: string; e: string; p: string; t: string }>(sql`
    select current_setting('neon.branch_id') as b, current_setting('neon.endpoint_id') as e,
           current_setting('neon.project_id') as p, current_setting('neon.timeline_id') as t`);
  const r = rows[0];
  if (!(r.b === TARGET.branch && r.e === TARGET.endpoint && r.p === TARGET.project && r.t.startsWith(TARGET.timeline))) {
    throw new Error('El pool del backend no está conectado a m03-flujo-medicos: se detiene');
  }
  return `${r.b}/${r.t.slice(0, 6)}`;
}

describe('M03: revisión del admin sobre el médico de prueba en m03-flujo-medicos (C2, datos confirmados)', () => {
  let app: INestApplication;
  let base: string;
  const mail = new CapturingEmailSender();
  const logger = new BufferLogger();
  const steps: { paso: string; http?: number; esperado?: number; ok: boolean; identidad?: string }[] = [];
  const states: Record<string, unknown> = {};
  const result: Record<string, unknown> = { pasos: steps, estados: states };
  let leaked = 0;

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
    result.logs = { lineas: logger.lines.length, datos_ajenos: foreignData(logger.lines) };
    result.respuestas_con_claves = leaked;
    process.stdout.write(`\nFLOW_RESULT ${JSON.stringify(result)}\n`);
    await db.$client.end();
  });

  // Paso que puede escribir: identidad del pool antes; código HTTP exacto; ninguna clave de objeto en la respuesta.
  async function step(paso: string, expected: number, run: () => Promise<request.Response>): Promise<request.Response> {
    const identidad = await backendIdentity();
    const res = await run();
    if (exposesObjectKeys(res.body)) leaked++;
    const ok = res.status === expected;
    steps.push({ paso, http: res.status, esperado: expected, ok, identidad });
    if (!ok) throw new Error(`Paso ${paso}: HTTP ${res.status} (se esperaba ${expected}); se detiene`);
    return res;
  }

  // Estado del médico por sus dos rutas: /me/doctor/status y /me (canOperate).
  async function observe(stage: ReviewStage, doctor: request.Agent) {
    const s = await doctor.get('/me/doctor/status').set('Origin', ORIGIN);
    const me = await doctor.get('/me').set('Origin', ORIGIN);
    if (exposesObjectKeys(s.body) || exposesObjectKeys(me.body)) leaked++;
    const observed = { status: s.body.status, identity: s.body.identity, professional: s.body.professional,
      registrationComplete: s.body.registrationComplete, missing: s.body.missing, canOperate: me.body?.registrationStatus?.canOperate };
    const failures = stateFailures(stage, observed);
    states[stage] = { observado: observed, ok: failures.length === 0 };
    if (failures.length > 0) throw new Error(`Estado ${stage} inesperado: ${failures.join('; ')}`);
  }

  async function signUpVerified(email: string, password: string, name: string): Promise<request.Agent> {
    await step(`alta ${name}`, 200, () => request(base).post('/api/auth/sign-up/email').set('Origin', ORIGIN).send({ email, password, name }));
    await new Promise((r) => setTimeout(r, 200));
    const link = mail.sent.find((m) => m.kind === 'email_verification' && m.to === email);
    if (!link) throw new Error('No se capturó el correo de verificación');
    const agent = request.agent(base);
    const identidad = await backendIdentity();
    const v = await agent.get(`/api/auth/verify-email?token=${encodeURIComponent(tokenFromUrl(link.url))}`).set('Origin', ORIGIN).redirects(0).ok(() => true);
    const ok = v.status === 200 || v.status === 302;
    steps.push({ paso: `verificación ${name}`, http: v.status, ok, identidad });
    if (!ok) throw new Error(`Verificación ${name}: HTTP ${v.status}`);
    const session = await agent.get('/api/auth/get-session').set('Origin', ORIGIN);
    if (!session.body?.user?.id) await step(`inicio de sesión ${name}`, 200, () => agent.post('/api/auth/sign-in/email').set('Origin', ORIGIN).send({ email, password }));
    return agent;
  }

  it('[TC-M03-204][RF-06][D-25][D-30] aprueba la INE, rechaza y vuelve a aprobar la cédula reenviada, con los estados y eventos esperados', async () => {
    // 0. Sujeto: exactamente un médico de prueba, con INE y cédula intento 1 pendientes.
    const { rows: doctors } = await db.execute<{ user_id: string; email: string; doctor_id: string }>(sql`
      select u.id as user_id, u.email, d.id as doctor_id from "user" u
        join user_profile p on p.user_id = u.id and p.role = 'doctor'
        join doctor_profile d on d.user_profile_id = p.id
       where u.email like ${`%@${TEST_DOMAIN}`}`);
    if (doctors.length !== 1) throw new Error(`Se esperaba exactamente un médico de prueba; hay ${doctors.length}`);
    const subject = doctors[0];
    const { rows: ine } = await db.execute<{ id: string; status: string; attempt: number }>(sql`select id, status, attempt from doctor_identity_verification where doctor_id = ${subject.doctor_id} order by attempt`);
    const { rows: lic } = await db.execute<{ id: string; status: string; attempt: number }>(sql`select id, status, attempt from doctor_license_verification where doctor_id = ${subject.doctor_id} order by attempt`);
    if (ine.length !== 1 || lic.length !== 1 || ine[0].status !== 'pending' || lic[0].status !== 'pending') throw new Error('El médico de prueba no está en el estado inicial (INE y cédula 1 pendientes)');
    result.sujeto = { doctor_profile_id: subject.doctor_id, ine_1: ine[0].id, cedula_1: lic[0].id };

    // 1. Acceso del médico con la recuperación de contraseña real (enlace capturado en memoria).
    const doctorPassword = `${randomBytes(18).toString('base64url')}-Aa1`;
    await step('recuperación: solicitud', 200, () => request(base).post('/api/auth/request-password-reset').set('Origin', ORIGIN).send({ email: subject.email, redirectTo: '/reset' }));
    await new Promise((r) => setTimeout(r, 200));
    const reset = mail.sent.find((m) => m.kind === 'password_reset' && m.to === subject.email);
    if (!reset) throw new Error('No se capturó el correo de recuperación');
    await step('recuperación: nueva contraseña', 200, () => request(base).post('/api/auth/reset-password').set('Origin', ORIGIN).send({ token: tokenFromUrl(reset.url), newPassword: doctorPassword }));
    const doctor = request.agent(base);
    await step('inicio de sesión del médico', 200, () => doctor.post('/api/auth/sign-in/email').set('Origin', ORIGIN).send({ email: subject.email, password: doctorPassword }));
    await observe('inicial', doctor);

    // 2. Admin de prueba: alta HTTP + promoción directa (excepción de prueba a DT-12, solo en esta rama).
    const adminEmail = `m03-admin-${randomUUID()}@${TEST_DOMAIN}`;
    const admin = await signUpVerified(adminEmail, `${randomBytes(18).toString('base64url')}-Aa1`, 'Admin Prueba M03');
    const adminUserId = (await admin.get('/api/auth/get-session').set('Origin', ORIGIN)).body.user.id as string;
    await backendIdentity();
    const adminProfileId = await db.transaction((tx) => transactionStorage.run(tx as never, () =>
      new DrizzleUserProfileRepository().createAdmin({ userId: adminUserId, firstName: 'Admin', lastName: 'Prueba M03' })));
    steps.push({ paso: 'promoción directa a admin (createAdmin)', ok: true, identidad: await backendIdentity() });
    result.admin = { user_id: adminUserId, user_profile_id: adminProfileId };
    const meAdmin = await admin.get('/me').set('Origin', ORIGIN);
    if (meAdmin.body?.role !== 'admin') throw new Error('La cuenta de prueba no quedó como admin');

    // N. Negativos: ninguno escribe.
    await step('N1 el médico en una ruta del admin', 403, () => doctor.get('/admin/doctor-identity-verifications').set('Origin', ORIGIN));
    await step('N2 aprobar con id no UUID', 400, () => admin.post('/admin/doctor-identity-verifications/no-es-uuid/approve').set('Origin', ORIGIN));
    await step('N3 aprobar un UUID inexistente', 404, () => admin.post(`/admin/doctor-identity-verifications/${randomUUID()}/approve`).set('Origin', ORIGIN));
    await step('N4 rechazar con motivo corto', 400, () => admin.post(`/admin/doctor-license-verifications/${lic[0].id}/reject`).set('Origin', ORIGIN).send({ reason: 'corto' }));
    const queue = await step('cola de INE pendientes', 200, () => admin.get('/admin/doctor-identity-verifications').set('Origin', ORIGIN));
    result.cola_ine_contiene_sujeto = JSON.stringify(queue.body).includes(ine[0].id);

    // A1. Aprobar la INE.
    const a1 = await step('A1 aprobar INE 1', 200, () => admin.post(`/admin/doctor-identity-verifications/${ine[0].id}/approve`).set('Origin', ORIGIN));
    result.A1 = { status: a1.body.status, attempt: a1.body.attempt, documentsDeleted: a1.body.documentsDeleted };
    if (a1.body.status !== 'approved' || a1.body.documentsDeleted !== true) throw new Error('A1: respuesta inesperada');
    await observe('ine_aprobada', doctor);

    // A2. Repetir la aprobación: 409, sin cambios.
    await step('A2 aprobar INE 1 otra vez', 409, () => admin.post(`/admin/doctor-identity-verifications/${ine[0].id}/approve`).set('Origin', ORIGIN));

    // R1. Rechazar la cédula 1.
    const r1 = await step('R1 rechazar cédula 1', 200, () => admin.post(`/admin/doctor-license-verifications/${lic[0].id}/reject`).set('Origin', ORIGIN).send({ reason: REJECTION_REASON }));
    result.R1 = { status: r1.body.status, attempt: r1.body.attempt };
    if (r1.body.status !== 'rejected') throw new Error('R1: respuesta inesperada');
    await observe('cedula_rechazada', doctor);

    // S1. El médico reenvía la cédula (mismo número).
    const { rows: num } = await db.execute<{ n: string }>(sql`select license_number as n from doctor_profile where id = ${subject.doctor_id}`);
    const s1 = await step('S1 reenvío de cédula', 201, () => doctor.post('/me/doctor/license-verifications').set('Origin', ORIGIN).field('licenseNumber', num[0].n).attach('document', PDF, 'c2.pdf'));
    result.S1 = { reviewId: s1.body.reviewId, attempt: s1.body.attempt, reason: s1.body.reason };
    if (s1.body.attempt !== 2 || s1.body.reason !== 'resubmission') throw new Error('S1: respuesta inesperada');
    await observe('cedula_reenviada', doctor);

    // A3. Aprobar la cédula 2.
    const a3 = await step('A3 aprobar cédula 2', 200, () => admin.post(`/admin/doctor-license-verifications/${s1.body.reviewId}/approve`).set('Origin', ORIGIN));
    result.A3 = { status: a3.body.status, attempt: a3.body.attempt };
    await observe('aprobado', doctor);

    // L. Lecturas finales.
    const history = await step('historial del médico', 200, () => doctor.get('/me/doctor/verification-history').set('Origin', ORIGIN));
    result.historial = {
      ine: (history.body.identity as { attempt: number; status: string }[]).map(({ attempt, status }) => ({ attempt, status })),
      cedula: (history.body.license as { attempt: number; status: string }[] | undefined)?.map(({ attempt, status }) => ({ attempt, status })) ?? null,
    };
    const after = await step('cola de cédulas pendientes al final', 200, () => admin.get('/admin/doctor-license-verifications').set('Origin', ORIGIN));
    result.cola_cedulas_contiene_sujeto = JSON.stringify(after.body).includes(subject.doctor_id);
    result.correos_capturados = mail.sent.map((m) => m.kind);
    result.identidad_al_terminar = await backendIdentity();
    expect(Object.values(states).every((s) => (s as { ok: boolean }).ok)).toBe(true);
    expect(Object.keys(states)).toEqual(Object.keys(EXPECTED_STATES));
  });
});

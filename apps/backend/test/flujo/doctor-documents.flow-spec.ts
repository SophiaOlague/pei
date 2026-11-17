import { FLOW_TARGET as TARGET } from './flow-guard'; // primero: falla antes de cargar el backend fuera de C2
import { createHash, randomUUID } from 'crypto';
import type { AddressInfo } from 'net';
import { INestApplication, type LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { installR2Traps } from './r2-traps';
import { AppModule } from '../../src/app.module';
import { db } from '../../src/db';
import { AUTH_INSTANCE, type Auth } from '../../src/auth/auth.config';
import { BetterAuthSessionProvider } from '../../src/auth/better-auth-session.provider';
import { SESSION_PROVIDER } from '../../src/auth/ports/session-provider';
import { DomainExceptionFilter } from '../../src/common/filters/domain-exception.filter';
import { createValidationPipe } from '../../src/common/validation/create-validation-pipe';
import { EMAIL_SENDER, type AuthEmail, type EmailSender } from '../../src/modules/identity/application/ports/email-sender';
import { PRIVATE_OBJECT_STORAGE } from '../../src/modules/private-storage/application/ports/private-object-storage';
import { PurgeTerminalDoctorIdentityDocumentsUseCase } from '../../src/modules/doctors/application/use-cases/admin/doctor-review.use-cases';
import { FakeDocumentStorage } from '../support/identity-in-memory';
import { syntheticJpeg } from '../support/synthetic-identity';
import { documentStateFailures, exposesStorageDetails, imageHeaderFailures, pdfHeaderFailures, unexpectedDeletions, type DocumentStage } from './documents-checks';
import { FLOW_USER_HEADER, FlowSessionProvider } from './flow-session';

// M03: APERTURA DE DOCUMENTOS POR EL ADMIN Y PURGA SIMULADA en `m03-flujo-medicos`, por HTTP con el AppModule real,
// sobre el MÉDICO DE PRUEBA EXISTENTE (sin crear cuentas ni restablecer contraseñas). Plan A (PLAN-A-documentos.md).
// Datos CONFIRMADOS y permanentes en la rama: el médico pasa de approved a pending (reenvía INE y cédula).
//
// - Almacén privado: SOLO la instancia FakeDocumentStorage de este runner (identidad comprobada). Los objetos de la INE
//   y la cédula se crean en memoria por la ruta real de subida (claves generadas por la aplicación). S3Client.send y
//   R2PrivateObjectStorage tienen trampas que cuentan y lanzan; el contador debe terminar en 0.
// - Sesión: FlowSessionProvider acepta por la cabecera `x-flow-user` SOLO el user.id del admin de prueba y el del
//   médico de prueba (únicas cuentas @m00.test.invalid de esos roles); sin cabecera, Better Auth real. Rol y permisos:
//   ActorProfileReader y RolesGuard reales.
// - Reintento de purga: PurgeTerminalDoctorIdentityDocumentsUseCase EN PROCESO (almacén en memoria), nunca el CLI
//   identity:purge-documents (que además purga INE de pacientes). La INE heredada de paciente no se toca.
//
// Solo mediante C2 (documentos-admin.cjs). Nunca imprime correos, contraseñas, tokens ni claves: solo FLOW_RESULT.
const ORIGIN = 'http://localhost:3000';
const TEST_DOMAIN = 'm00.test.invalid';
const PDF = Buffer.from('%PDF-1.7\n% documento sintetico M03 documentos del admin\n');
const REJECTION_REASON = 'TEST: INE ilegible (prueba M03 documentos)';

// Ningún correo sale: el doble solo los cuenta (el recorrido no debe pedir ninguno).
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
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
// Cuerpo binario tal cual (imágenes y PDF).
const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

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

// Huella de la INE heredada de paciente (ids y claves en md5; nunca se imprimen las claves).
async function patientIneFingerprint() {
  const { rows } = await db.execute<{ n: number; h: string }>(sql`
    select count(*)::int as n, md5(coalesce(string_agg(id::text || '|' || coalesce(ine_front_object_key, '') || '|' || coalesce(ine_back_object_key, '') || '|' || status::text || '|' || coalesce(documents_deleted_at::text, ''), ',' order by id), '')) as h
      from patient_identity_verification`);
  return rows[0];
}

async function identityKeys(reviewId: string) {
  const { rows } = await db.execute<{ f: string | null; b: string | null; purged: boolean; status: string }>(sql`
    select ine_front_object_key as f, ine_back_object_key as b, documents_deleted_at is not null as purged, status::text
      from doctor_identity_verification where id = ${reviewId}`);
  return rows[0];
}

const terminalDoctorIneWithKeys = async () => (await db.execute<{ id: string }>(sql`
  select id::text from doctor_identity_verification where status <> 'pending' and (ine_front_object_key is not null or ine_back_object_key is not null)`)).rows.map((r) => r.id);

describe('M03: documentos del admin y purga simulada sobre el médico de prueba existente (C2, datos confirmados)', () => {
  let app: INestApplication;
  let base: string;
  const traps = installR2Traps(); // antes de compilar el módulo
  const storage = new FakeDocumentStorage();
  const mail = new CapturingEmailSender();
  const logger = new BufferLogger();
  const steps: { paso: string; http?: number; esperado?: number; ok: boolean; identidad?: string; detalle?: string[] }[] = [];
  const result: Record<string, unknown> = { pasos: steps };
  let leaked = 0;
  const who = { adminUserId: '', doctorUserId: '', doctorId: '', ine1: '', licWithoutObject: '', licenseNumber: '' };

  beforeAll(async () => {
    result.identidad_antes_de_arrancar = await backendIdentity();
    // Precondiciones (lectura): exactamente un admin y un médico de prueba; el médico aprobado, con la INE 1 aprobada y
    // purgada y una cédula aprobada con clave (sin objeto en este proceso); ninguna INE terminal de médico con claves.
    const { rows: admins } = await db.execute<{ id: string }>(sql`
      select u.id from "user" u join user_profile p on p.user_id = u.id and p.role = 'admin' where u.email like ${`%@${TEST_DOMAIN}`}`);
    const { rows: doctors } = await db.execute<{ user_id: string; doctor_id: string; license_number: string | null }>(sql`
      select u.id as user_id, d.id::text as doctor_id, d.license_number from "user" u
        join user_profile p on p.user_id = u.id and p.role = 'doctor'
        join doctor_profile d on d.user_profile_id = p.id where u.email like ${`%@${TEST_DOMAIN}`}`);
    if (admins.length !== 1) throw new Error(`Se esperaba exactamente un admin de prueba; hay ${admins.length}`);
    if (doctors.length !== 1) throw new Error(`Se esperaba exactamente un médico de prueba; hay ${doctors.length}`);
    const doctor = doctors[0];
    const { rows: ine } = await db.execute<{ id: string; status: string; purged: boolean }>(sql`
      select id::text, status::text, documents_deleted_at is not null as purged from doctor_identity_verification where doctor_id = ${doctor.doctor_id} order by attempt`);
    const { rows: lic } = await db.execute<{ id: string; status: string }>(sql`
      select id::text, status::text from doctor_license_verification where doctor_id = ${doctor.doctor_id} and document_object_key is not null order by attempt`);
    if (ine.length !== 1 || ine[0].status !== 'approved' || !ine[0].purged) throw new Error('El médico de prueba no tiene exactamente una INE aprobada y purgada');
    const approvedLic = lic.filter((l) => l.status === 'approved');
    if (approvedLic.length !== 1 || !doctor.license_number) throw new Error('El médico de prueba no tiene una cédula aprobada con clave y número');
    if ((await terminalDoctorIneWithKeys()).length !== 0) throw new Error('Ya hay INE terminales de médicos con claves: se detiene');
    Object.assign(who, { adminUserId: admins[0].id, doctorUserId: doctor.user_id, doctorId: doctor.doctor_id, ine1: ine[0].id, licWithoutObject: approvedLic[0].id, licenseNumber: doctor.license_number });
    result.precondiciones = { doctor_profile_id: who.doctorId, ine_1: who.ine1, cedula_sin_objeto: who.licWithoutObject, ine_paciente: await patientIneFingerprint() };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PRIVATE_OBJECT_STORAGE).useValue(storage)
      .overrideProvider(EMAIL_SENDER).useValue(mail)
      .overrideProvider(SESSION_PROVIDER).useFactory({
        factory: (auth: Auth) => new FlowSessionProvider(new BetterAuthSessionProvider(auth), [who.adminUserId, who.doctorUserId]),
        inject: [AUTH_INSTANCE],
      })
      .compile();
    app = moduleRef.createNestApplication({ bodyParser: false, logger });
    app.useGlobalFilters(new DomainExceptionFilter());
    app.useGlobalPipes(createValidationPipe());
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    if (address.address !== '127.0.0.1') throw new Error('El servidor no escucha solo en 127.0.0.1');
    base = `http://127.0.0.1:${address.port}`;
    if (app.get(PRIVATE_OBJECT_STORAGE) !== storage) throw new Error('El almacén resuelto no es el FakeDocumentStorage del runner');
    result.almacen_es_el_del_runner = true;
    result.identidad_tras_arrancar = await backendIdentity();
  });

  afterAll(async () => {
    await app?.close();
    result.trampas_r2 = traps.calls();
    result.correos_pedidos = mail.sent.length;
    result.logs = { lineas: logger.lines.length, datos_ajenos: foreignData(logger.lines) };
    result.respuestas_con_claves = leaked;
    traps.restore();
    process.stdout.write(`\nFLOW_RESULT ${JSON.stringify(result)}\n`);
    await db.$client.end();
  });

  async function step(paso: string, expected: number, run: () => Promise<request.Response>, check?: (res: request.Response) => string[]) {
    const identidad = await backendIdentity();
    const res = await run();
    if (exposesStorageDetails(res.headers) || (!Buffer.isBuffer(res.body) && exposesStorageDetails(res.body))) leaked++;
    const detalle = res.status === expected && check ? check(res) : [];
    const ok = res.status === expected && detalle.length === 0;
    steps.push({ paso, http: res.status, esperado: expected, ok, identidad, ...(detalle.length ? { detalle } : {}) });
    if (!ok) throw new Error(`Paso ${paso}: HTTP ${res.status} (se esperaba ${expected}) ${detalle.join('; ')}; se detiene`);
    return res;
  }
  const asAdmin = (r: request.Test) => r.set(FLOW_USER_HEADER, who.adminUserId).set('Origin', ORIGIN);
  const asDoctor = (r: request.Test) => r.set(FLOW_USER_HEADER, who.doctorUserId).set('Origin', ORIGIN);
  // Estado del médico por sus dos rutas; si no es el esperado para la etapa, se detiene.
  const status = async (stage: DocumentStage) => {
    const s = await asDoctor(request(base).get('/me/doctor/status'));
    const me = await asDoctor(request(base).get('/me'));
    const observed = { status: s.body.status, identity: s.body.identity, professional: s.body.professional, canOperate: me.body?.registrationStatus?.canOperate };
    const failures = documentStateFailures(stage, observed);
    (result.estados as Record<string, unknown>)[stage] = { observado: observed, ok: failures.length === 0 };
    if (failures.length > 0) throw new Error(`Estado ${stage} inesperado: ${failures.join('; ')}`);
    return observed;
  };

  it('[TC-M03-211][D-22][D-19][H.3] el admin abre INE y cédula con auditoría; la purga simulada falla, se reintenta y se completa', async () => {
    result.estados = {};
    await status('inicial');
    const ine1 = who.ine1;

    // D3, D4 y D6: sin cambios de estado del médico (D6 deja un evento de lectura).
    await step('D3 lado inválido', 400, () => asAdmin(request(base).get(`/admin/doctor-identity-verifications/${ine1}/documents/lateral`)));
    await step('D4a el médico en la ruta del admin', 403, () => asDoctor(request(base).get(`/admin/doctor-identity-verifications/${ine1}/documents/front`)));
    await step('D4b sin sesión', 401, () => request(base).get(`/admin/doctor-identity-verifications/${ine1}/documents/front`).set('Origin', ORIGIN));
    await step('D4c cabecera con otro id', 401, () => request(base).get(`/admin/doctor-identity-verifications/${ine1}/documents/front`).set(FLOW_USER_HEADER, randomUUID()).set('Origin', ORIGIN));
    await step('D6 admin abre cédula sin objeto', 404, () => asAdmin(request(base).get(`/admin/doctor-license-verifications/${who.licWithoutObject}/document`)));

    // Fixtures en memoria por la ruta real: el médico reenvía la INE (2) y la cédula (3, mismo número).
    const front2 = syntheticJpeg(300);
    const back2 = Buffer.concat([syntheticJpeg(4), Buffer.alloc(296, 7)]);
    const ine2 = await step('S1 reenvío de INE (intento 2)', 201, () => asDoctor(request(base).post('/me/doctor/identity-verifications')).attach('front', front2, 'f.jpg').attach('back', back2, 'b.jpg'),
      (res) => (res.body.attempt === 2 ? [] : ['no es el intento 2']));
    const lic3 = await step('S2 reenvío de cédula (mismo número)', 201, () => asDoctor(request(base).post('/me/doctor/license-verifications')).field('licenseNumber', who.licenseNumber).attach('document', PDF, 'c.pdf'),
      (res) => (res.body.reason === 'license_document_changed' ? [] : [`motivo ${String(res.body.reason)}`]));
    result.revisiones = { ine_2: ine2.body.reviewId, cedula_3: { id: lic3.body.reviewId, attempt: lic3.body.attempt, reason: lic3.body.reason } };
    await status('tras_reenvios');
    const ine2Keys = await identityKeys(ine2.body.reviewId);

    // D1, D2 y D5: apertura con objetos en memoria.
    await step('D1 admin abre frente INE 2', 200, () => asAdmin(request(base).get(`/admin/doctor-identity-verifications/${ine2.body.reviewId}/documents/front`)).buffer(true).parse(binary),
      (res) => [...imageHeaderFailures(res.headers, 'image/jpeg'), ...(sha(res.body as Buffer) === sha(front2) ? [] : ['bytes distintos'])]);
    await step('D2 admin abre reverso INE 2', 200, () => asAdmin(request(base).get(`/admin/doctor-identity-verifications/${ine2.body.reviewId}/documents/back`)).buffer(true).parse(binary),
      (res) => [...imageHeaderFailures(res.headers, 'image/jpeg'), ...(sha(res.body as Buffer) === sha(back2) ? [] : ['bytes distintos'])]);
    await step('D5 admin abre cédula 3', 200, () => asAdmin(request(base).get(`/admin/doctor-license-verifications/${lic3.body.reviewId}/document`)).buffer(true).parse(binary),
      (res) => [...pdfHeaderFailures(res.headers), ...(sha(res.body as Buffer) === sha(PDF) ? [] : ['bytes distintos'])]);

    // P1–P4: rechazo con purga fallida, conflicto, reintento e idempotencia.
    storage.failDelete = true;
    const p1 = await step('P1 rechazar INE 2 con fallo de purga', 200, () => asAdmin(request(base).post(`/admin/doctor-identity-verifications/${ine2.body.reviewId}/reject`)).send({ reason: REJECTION_REASON }),
      (res) => (res.body.status === 'rejected' && res.body.documentsDeleted === false ? [] : ['respuesta inesperada']));
    storage.failDelete = false;
    const afterP1 = await identityKeys(ine2.body.reviewId);
    result.P1 = { status: p1.body.status, documentsDeleted: p1.body.documentsDeleted, conserva_claves: !!afterP1.f && !!afterP1.b && !afterP1.purged,
      objetos_en_memoria: storage.objects.has(ine2Keys.f!) && storage.objects.has(ine2Keys.b!), borradas: storage.deleted.length,
      log_de_fallo: logger.lines.filter((l) => l.includes(`doctor_identity_purge_failed review=${ine2.body.reviewId}`)).length,
      log_sin_claves: !logger.lines.some((l) => exposesStorageDetails(l)) };
    await status('tras_rechazo');
    await step('P2 abrir INE 2 rechazada', 409, () => asAdmin(request(base).get(`/admin/doctor-identity-verifications/${ine2.body.reviewId}/documents/front`)));

    const terminal = await terminalDoctorIneWithKeys();
    if (terminal.length !== 1 || terminal[0] !== ine2.body.reviewId) throw new Error('P3: la única INE terminal con claves debía ser la INE 2 del médico de prueba');
    await backendIdentity();
    const purge = app.get(PurgeTerminalDoctorIdentityDocumentsUseCase);
    const p3 = await purge.execute();
    const afterP3 = await identityKeys(ine2.body.reviewId);
    steps.push({ paso: 'P3 reintento de purga en proceso', ok: p3.found === 1 && p3.purged === 1 && p3.failed === 0 && afterP3.purged && !afterP3.f && !afterP3.b, identidad: await backendIdentity() });
    const p4 = await purge.execute();
    steps.push({ paso: 'P4 reintento idempotente', ok: p4.found === 0 && p4.purged === 0 && p4.failed === 0 });
    result.P3_P4 = { p3, p4 };

    // P5–P9: reenvío, aprobación con purga, conflicto y cédula conservada.
    const front3 = syntheticJpeg(320);
    const back3 = Buffer.concat([syntheticJpeg(4), Buffer.alloc(316, 9)]);
    const ine3 = await step('P5 reenvío de INE (intento 3)', 201, () => asDoctor(request(base).post('/me/doctor/identity-verifications')).attach('front', front3, 'f3.jpg').attach('back', back3, 'b3.jpg'),
      (res) => (res.body.attempt === 3 ? [] : ['no es el intento 3']));
    result.revisiones = { ...(result.revisiones as object), ine_3: ine3.body.reviewId };
    const ine3Keys = await identityKeys(ine3.body.reviewId);
    await step('P6 admin abre frente INE 3', 200, () => asAdmin(request(base).get(`/admin/doctor-identity-verifications/${ine3.body.reviewId}/documents/front`)).buffer(true).parse(binary),
      (res) => [...imageHeaderFailures(res.headers, 'image/jpeg'), ...(sha(res.body as Buffer) === sha(front3) ? [] : ['bytes distintos'])]);
    const p7 = await step('P7 aprobar INE 3', 200, () => asAdmin(request(base).post(`/admin/doctor-identity-verifications/${ine3.body.reviewId}/approve`)),
      (res) => (res.body.status === 'approved' && res.body.documentsDeleted === true ? [] : ['respuesta inesperada']));
    result.P7 = { status: p7.body.status, documentsDeleted: p7.body.documentsDeleted };
    await step('P8 abrir INE 3 aprobada', 409, () => asAdmin(request(base).get(`/admin/doctor-identity-verifications/${ine3.body.reviewId}/documents/front`)));
    await step('P9 la cédula 3 se conserva', 200, () => asAdmin(request(base).get(`/admin/doctor-license-verifications/${lic3.body.reviewId}/document`)).buffer(true).parse(binary),
      (res) => pdfHeaderFailures(res.headers));
    await status('final');

    // Aislamiento del almacén y de la INE de paciente.
    result.borrados_inesperados = unexpectedDeletions(storage.deleted, [ine2Keys.f!, ine2Keys.b!, ine3Keys.f!, ine3Keys.b!]);
    result.borradas = storage.deleted.length;
    result.ine_paciente_despues = await patientIneFingerprint();
    result.trampas_r2_en_curso = traps.calls();
    result.identidad_al_terminar = await backendIdentity();
    expect(steps.every((s) => s.ok)).toBe(true);
    expect(result.borrados_inesperados).toEqual([]);
    expect(traps.calls()).toBe(0);
    expect(mail.sent).toHaveLength(0);
    expect(result.ine_paciente_despues).toEqual((result.precondiciones as { ine_paciente: unknown }).ine_paciente);
  });
});

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createIdentityApp, SESSION_HEADER } from './support/identity-e2e';
import type { FakeDocumentStorage, InMemoryIdentityStore } from './support/identity-in-memory';
import { fakePdf, syntheticCurp, syntheticJpeg, syntheticPng } from './support/synthetic-identity';
import { MAX_IMAGE_BYTES } from '../src/modules/private-storage/domain/file-signature';

// E2E HTTP de Identity (M02) con controllers, guards, pipe y filtro reales; sesiones simuladas,
// repositorios en memoria y almacenamiento falso. Sin BD, sin R2, sin INEs reales y sin CURP reales.

describe('Identity M02 por HTTP (E2E con dobles)', () => {
  let app: INestApplication;
  let store: InMemoryIdentityStore;
  let storage: FakeDocumentStorage;
  let privacyId: string;
  let termsId: string;
  let adminId: string;

  beforeAll(async () => {
    ({ app, store, storage } = await createIdentityApp());
    privacyId = store.publishLegalDocument('privacy_notice', 'v1').id;
    termsId = store.publishLegalDocument('terms_and_conditions', 'v1').id;
    adminId = `admin-${randomUUID()}`;
    await store.createAdmin({ userId: adminId, firstName: 'Admin', lastName: 'E2E' });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const as = (userId: string) => ({
    get: (path: string) => http().get(path).set(SESSION_HEADER, userId),
    post: (path: string) => http().post(path).set(SESSION_HEADER, userId),
    patch: (path: string) => http().patch(path).set(SESSION_HEADER, userId),
    put: (path: string) => http().put(path).set(SESSION_HEADER, userId),
  });
  const admin = () => as(adminId);

  async function newPatient(options: { legal?: boolean } = {}) {
    const userId = `paciente-${randomUUID()}`;
    const res = await as(userId)
      .post('/me/patient-profile')
      .send({ firstName: 'Paciente', lastName: 'Sintético', curp: syntheticCurp(), birthDate: '1990-01-01' });
    expect(res.status).toBe(201);
    if (options.legal) {
      expect((await as(userId).post('/me/legal-acceptances').send({ documentIds: [privacyId, termsId] })).status).toBe(201);
    }
    return userId;
  }

  const upload = (userId: string, front: Buffer | null = syntheticJpeg(), back: Buffer | null = syntheticPng()) => {
    const req = as(userId).post('/me/identity-verification');
    if (front) req.attach('front', front, { filename: 'frente.jpg', contentType: 'image/jpeg' });
    if (back) req.attach('back', back, { filename: 'reverso.png', contentType: 'image/png' });
    return req;
  };
  const missing = async (userId: string) => (await as(userId).get('/me/registration-status')).body.missing;

  describe('estados del registro (DP-8)', () => {
    it('[TC-M02-210][DP-8][RF-02] cuenta sin perfil → perfil → legales → INE pendiente → rechazada → reenvío → aprobada → nueva versión legal', async () => {
      const userId = `paciente-${randomUUID()}`;
      expect(await missing(userId)).toEqual(['profile', 'legal', 'identity_submission']);

      await as(userId).post('/me/patient-profile').send({ firstName: 'Ana', lastName: 'Sintética', curp: syntheticCurp(), birthDate: '1985-05-15' }).expect(201);
      expect(await missing(userId)).toEqual(['legal', 'identity_submission']);

      await as(userId).post('/me/legal-acceptances').send({ documentIds: [privacyId, termsId] }).expect(201);
      expect(await missing(userId)).toEqual(['identity_submission']);

      const first = await upload(userId).expect(201);
      expect(first.body).toEqual({ submissionId: expect.any(String), status: 'pending', attempt: 1 });
      expect(await missing(userId)).toEqual(['identity_review']);

      await admin().post(`/admin/identity-verifications/${first.body.submissionId}/reject`).send({ reason: 'La imagen está borrosa' }).expect(200);
      const rejected = (await as(userId).get('/me/registration-status')).body;
      expect(rejected.missing).toEqual(['identity_resubmission']);
      expect(rejected.identity).toEqual({ status: 'rejected', rejectionReason: 'La imagen está borrosa' });

      const second = await upload(userId).expect(201);
      expect(second.body.attempt).toBe(2);
      await admin().post(`/admin/identity-verifications/${second.body.submissionId}/approve`).expect(200);

      const complete = (await as(userId).get('/me/registration-status')).body;
      expect(complete).toMatchObject({ registrationComplete: true, canBookAppointments: true, missing: [] });

      const newTerms = store.publishLegalDocument('terms_and_conditions', 'v2', new Date(Date.now() - 1000));
      const afterNewVersion = (await as(userId).get('/me/registration-status')).body;
      expect(afterNewVersion).toMatchObject({ registrationComplete: false, canBookAppointments: false, missing: ['legal'] });
      expect(afterNewVersion.legal.pending).toEqual([{ type: 'terms_and_conditions', documentId: newTerms.id, version: 'v2' }]);
      // Restablece la versión vigente original para las demás pruebas.
      store.state.legalDocuments = store.state.legalDocuments.filter((d) => d.id !== newTerms.id);
    });

    it('[TC-M02-211][DP-8][DT-21] agendar sin registro completo → 403 con missing; con registro completo → permitido', async () => {
      const userId = await newPatient({ legal: true });
      const blocked = await as(userId).post('/test-booking');
      expect(blocked.status).toBe(403);
      expect(blocked.body).toEqual({
        statusCode: 403,
        message: 'El registro del paciente está incompleto',
        error: 'RegistrationIncompleteError',
        details: { missing: ['identity_submission'] },
      });

      const { body } = await upload(userId).expect(201);
      await admin().post(`/admin/identity-verifications/${body.submissionId}/approve`).expect(200);
      expect((await as(userId).post('/test-booking')).body).toEqual({ booked: true });
    });

    it('[TC-M02-212][RF-02] GET /me: cuenta, rol, perfil y estado del registro, sin claves ni URLs de R2', async () => {
      const userId = await newPatient();
      const res = await as(userId).get('/me').expect(200);
      expect(res.body).toMatchObject({
        user: { id: userId, email: `${userId}@e2e.test` },
        role: 'patient',
        profile: { firstName: 'Paciente', hasPhoto: false },
        registrationStatus: { profileCompleted: true },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/r2\.|http|identity\/|object_?key/i);
      expect((await admin().get('/me').expect(200)).body).toMatchObject({ role: 'admin', profile: null, registrationStatus: null });
    });
  });

  describe('subida del INE (DT-4)', () => {
    it('[TC-M02-213][DT-4] sin front o sin back → 400; firma inválida → 400; MIME falsificado → 400', async () => {
      const userId = await newPatient();
      expect((await upload(userId, null)).status).toBe(400);
      expect((await upload(userId, syntheticJpeg(), null)).status).toBe(400);
      expect((await upload(userId, fakePdf(), syntheticPng())).status).toBe(400);

      // Otro paciente: el rate limit (3 por hora) también cuenta las subidas inválidas.
      const other = await newPatient();
      const spoofed = await as(other)
        .post('/me/identity-verification')
        .attach('front', fakePdf(), { filename: 'frente.png', contentType: 'image/png' })
        .attach('back', Buffer.from('texto plano'), { filename: 'reverso.jpg', contentType: 'image/jpeg' });
      expect(spoofed.status).toBe(400);
      expect(spoofed.body.message).toBe('El archivo debe ser una imagen JPEG o PNG de máximo 5 MB');
      const profileIds = store.state.patientProfiles
        .filter((p) => store.state.userProfiles.some((u) => u.id === p.userProfileId && [userId, other].includes(u.userId)))
        .map((p) => p.id);
      expect(store.state.verifications.filter((v) => profileIds.includes(v.patientProfileId))).toHaveLength(0);
    });

    it('[TC-M02-214][DT-4] 5 MB exactos se aceptan; 5 MB + 1 byte → 413; un campo no esperado → 400', async () => {
      const big = await newPatient();
      expect((await upload(big, syntheticJpeg(MAX_IMAGE_BYTES + 1))).status).toBe(413);
      expect(
        (await as(big).post('/me/identity-verification').attach('front', syntheticJpeg()).attach('back', syntheticJpeg()).attach('extra', syntheticJpeg()))
          .status,
      ).toBe(400);
      expect((await upload(big, syntheticJpeg(MAX_IMAGE_BYTES), syntheticPng(MAX_IMAGE_BYTES))).status).toBe(201);
    });

    it('[TC-M02-215][DT-8][DT-16] el rate limit de subida responde 429 aunque las respuestas previas fueran 409', async () => {
      const userId = await newPatient();
      expect((await upload(userId)).status).toBe(201);
      expect((await upload(userId)).status).toBe(409);
      expect((await upload(userId)).status).toBe(409);
      const limited = await upload(userId);
      expect(limited.status).toBe(429);
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  describe('acceso administrativo a los documentos (DP-15, DT-1)', () => {
    async function pendingSubmission() {
      const userId = await newPatient();
      const front = syntheticJpeg(256);
      const { body } = await upload(userId, front, syntheticPng()).expect(201);
      return { userId, submissionId: body.submissionId as string, front };
    }

    it('[TC-M02-216][DP-15][RNF-08] admin sobre un envío pendiente → 200 transmitido con no-store y evento viewed', async () => {
      const { submissionId, front } = await pendingSubmission();
      const res = await admin().get(`/admin/identity-verifications/${submissionId}/documents/front`).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['pragma']).toBe('no-cache');
      expect(res.headers['content-disposition']).toBe('inline');
      expect(Buffer.compare(res.body, front)).toBe(0);
      expect(store.state.audit.at(-1)).toMatchObject({ action: 'identity.identity_document.viewed', entityId: submissionId, metadata: { side: 'front' } });
    });

    it('[TC-M02-217][RF-07] lista y detalle sin claves de objetos ni URLs', async () => {
      const { submissionId } = await pendingSubmission();
      const list = await admin().get('/admin/identity-verifications?page=1&pageSize=50').expect(200);
      expect(list.body.items).toEqual(expect.arrayContaining([{ id: submissionId, attempt: 1, submittedAt: expect.any(String) }]));
      const detail = await admin().get(`/admin/identity-verifications/${submissionId}`).expect(200);
      expect(detail.body).toMatchObject({ id: submissionId, status: 'pending', patient: { firstName: 'Paciente', curp: expect.stringMatching(/^X/) } });
      expect(JSON.stringify([list.body, detail.body])).not.toMatch(/identity\/|object_?key|http/i);
    });

    it.each(['approve', 'reject'] as const)('[TC-M02-218][DT-5] tras %s: documentos eliminados y acceso → 409', async (decision) => {
      const { submissionId } = await pendingSubmission();
      const review = admin().post(`/admin/identity-verifications/${submissionId}/${decision}`);
      const res = await (decision === 'reject' ? review.send({ reason: 'Los datos no coinciden' }) : review);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ submissionId, documentsDeleted: true });
      expect([...storage.objects.keys()].some((k) => k.includes(submissionId))).toBe(false);

      const after = await admin().get(`/admin/identity-verifications/${submissionId}/documents/back`);
      expect(after.status).toBe(409);
      expect(after.body.message).toBe('Los documentos de esta verificación ya no están disponibles');
      expect((await admin().post(`/admin/identity-verifications/${submissionId}/approve`)).status).toBe(409);
    });

    it('[TC-M02-219][RF-02][DP-15] el paciente no accede a documentos ni a rutas de administración → 403; sin sesión → 401', async () => {
      const { userId, submissionId } = await pendingSubmission();
      for (const path of [`/admin/identity-verifications/${submissionId}/documents/front`, '/admin/identity-verifications', `/admin/identity-verifications/${submissionId}`]) {
        expect((await as(userId).get(path)).status).toBe(403);
        expect((await http().get(path)).status).toBe(401);
      }
      expect((await as(userId).post(`/admin/identity-verifications/${submissionId}/approve`)).status).toBe(403);
    });

    it('[TC-M02-220][RNF-10] parámetros inválidos → 400 (lado o id)', async () => {
      const { submissionId } = await pendingSubmission();
      expect((await admin().get(`/admin/identity-verifications/${submissionId}/documents/selfie`)).status).toBe(400);
      expect((await admin().get('/admin/identity-verifications/no-es-uuid')).status).toBe(400);
      expect((await admin().post(`/admin/identity-verifications/${submissionId}/reject`).send({ reason: 'corto' })).status).toBe(400);
    });
  });

  describe('perfil (DP-12, DT-7) y protección del rol (DP-5)', () => {
    it.each(['curp', 'firstName', 'lastName', 'birthDate', 'role'])('[TC-M02-221][DP-12] PATCH /me/profile con %s → 400', async (field) => {
      const userId = await newPatient();
      const res = await as(userId).patch('/me/profile').send({ phone: '5551234567', [field]: 'X' });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain(`property ${field} should not exist`);
    });

    it('[TC-M02-222][DP-12] PATCH con campos editables → 200 y auditado sin valores', async () => {
      const userId = await newPatient();
      const res = await as(userId).patch('/me/profile').send({ phone: '5551234567', emergencyContactName: 'Contacto Sintético' }).expect(200);
      expect(res.body.updated.sort()).toEqual(['emergencyContactName', 'phone']);
      expect((await as(userId).get('/me/profile')).body).toMatchObject({ phone: '5551234567', emergencyContactName: 'Contacto Sintético' });
      expect(JSON.stringify(store.state.audit.at(-1)!.metadata)).not.toContain('555');
    });

    it('[TC-M02-223][DP-5][RN-002] el alta no acepta rol (400) y una cuenta con perfil no crea otro (409)', async () => {
      const userId = `paciente-${randomUUID()}`;
      const base = { firstName: 'P', lastName: 'Q', curp: syntheticCurp(), birthDate: '1990-01-01' };
      expect((await as(userId).post('/me/patient-profile').send({ ...base, role: 'admin' })).status).toBe(400);
      await as(userId).post('/me/patient-profile').send(base).expect(201);
      expect((await as(userId).post('/me/patient-profile').send({ ...base, curp: syntheticCurp() })).status).toBe(409);
      expect((await as(adminId).post('/me/patient-profile').send({ ...base, curp: syntheticCurp() })).status).toBe(409);
      expect(store.state.userProfiles.find((p) => p.userId === userId)?.role).toBe('patient');
    });

    it('[TC-M02-224][DT-22] CURP duplicada por HTTP → 409 genérico sin el valor; CURP inválida → 400', async () => {
      const curp = syntheticCurp();
      await as(`p-${randomUUID()}`).post('/me/patient-profile').send({ firstName: 'A', lastName: 'B', curp, birthDate: '1990-01-01' }).expect(201);
      const dup = await as(`p-${randomUUID()}`).post('/me/patient-profile').send({ firstName: 'C', lastName: 'D', curp: curp.toLowerCase(), birthDate: '1990-01-01' });
      expect(dup.status).toBe(409);
      expect(dup.body.message).toBe('No fue posible completar el registro con los datos proporcionados');
      expect(JSON.stringify(dup.body)).not.toContain(curp);
      const invalid = await as(`p-${randomUUID()}`).post('/me/patient-profile').send({ firstName: 'C', lastName: 'D', curp: 'XBXX010101HNEXXXA4', birthDate: '1990-01-01' });
      expect(invalid.status).toBe(400);
      expect(JSON.stringify(invalid.body)).not.toContain('XBXX');
    });

    it('[TC-M02-225][DT-7] foto privada: PUT → 200; GET transmitida con no-store; sin foto → 404', async () => {
      const userId = await newPatient();
      expect((await as(userId).get('/me/profile/photo')).status).toBe(404);
      await as(userId).put('/me/profile/photo').attach('photo', syntheticPng(128), { filename: 'foto.png' }).expect(200);
      const photo = await as(userId).get('/me/profile/photo');
      expect(photo.status).toBe(200);
      expect(photo.headers['content-type']).toBe('image/png');
      expect(photo.headers['cache-control']).toBe('no-store');
      expect((await as(userId).get('/me/profile')).body.hasPhoto).toBe(true);
      expect((await as(userId).put('/me/profile/photo').attach('photo', fakePdf(), { filename: 'foto.png', contentType: 'image/png' })).status).toBe(400);
    });

    it('[TC-M02-226][DT-13] /me/complete-profile y /me/upload ya no existen → 404', async () => {
      const userId = await newPatient();
      expect((await as(userId).post('/me/complete-profile').send({})).status).toBe(404);
      expect((await as(userId).post('/me/upload').attach('file', syntheticJpeg())).status).toBe(404);
    });

    it('[TC-M02-227][RF-03] GET /legal-documents/current es público y devuelve las versiones vigentes', async () => {
      const res = await http().get('/legal-documents/current').expect(200);
      expect(res.body.map((d: { id: string }) => d.id).sort()).toEqual([privacyId, termsId].sort());
    });
  });
});

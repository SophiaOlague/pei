import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createIdentityApp, SESSION_HEADER } from './support/identity-e2e';
import type { InMemoryIdentityStore } from './support/identity-in-memory';
import { syntheticCurp } from './support/synthetic-identity';

// E2E HTTP de los documentos legales por rol (M03 A2: D-32, N1, R-8; plan v2 §6) con dobles en memoria.
// Recorre los dos estados: antes y después de publicar los documentos nuevos.

describe('Documentos legales por rol por HTTP (E2E con dobles)', () => {
  let app: INestApplication;
  let store: InMemoryIdentityStore;
  let legacyPrivacy: string;
  let legacyTerms: string;

  beforeAll(async () => {
    ({ app, store } = await createIdentityApp());
    legacyPrivacy = store.publishLegalDocument('privacy_notice', 'v1').id;
    legacyTerms = store.publishLegalDocument('terms_and_conditions', 'v1').id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const as = (userId: string) => ({
    get: (path: string) => http().get(path).set(SESSION_HEADER, userId),
    post: (path: string) => http().post(path).set(SESSION_HEADER, userId),
  });
  const types = (body: { type: string }[]) => body.map((d) => d.type).sort();

  async function newPatient() {
    const userId = `paciente-${randomUUID()}`;
    const res = await as(userId)
      .post('/me/patient-profile')
      .send({ firstName: 'Paciente', lastName: 'Sintético', curp: syntheticCurp(), birthDate: '1990-01-01' });
    expect(res.status).toBe(201);
    return userId;
  }
  function newDoctor() {
    const userId = `medico-${randomUUID()}`;
    store.createDoctorForTest({ userId, firstName: 'Médico', lastName: 'Sintético', curp: syntheticCurp() });
    return userId;
  }

  let patientOnLegacy: string;

  it('[TC-M03-030][N1] antes de publicar: el paciente ve y acepta el legado v1; el médico no tiene documentos', async () => {
    const current = await http().get('/legal-documents/current');
    expect(current.status).toBe(200);
    expect(types(current.body)).toEqual(['privacy_notice', 'terms_and_conditions']);
    expect(types((await http().get('/legal-documents/current?audience=patient')).body)).toEqual(['privacy_notice', 'terms_and_conditions']);
    expect((await http().get('/legal-documents/current?audience=doctor')).status).toBe(409);
    expect((await http().get('/legal-documents/current?audience=admin')).status).toBe(400);

    patientOnLegacy = await newPatient();
    expect((await as(patientOnLegacy).post('/me/legal-acceptances').send({ documentIds: [legacyPrivacy, legacyTerms] })).status).toBe(201);
    expect((await as(patientOnLegacy).get('/me/registration-status')).body.legal).toEqual({ accepted: true, pending: [] });

    const doctor = newDoctor();
    expect((await as(doctor).post('/me/legal-acceptances').send({ documentIds: [legacyPrivacy] })).status).toBe(409);
  });

  it('[TC-M03-049][R-8] ids duplicados → 400 en el límite HTTP, sin aceptaciones ni eventos', async () => {
    const patient = await newPatient();
    const acceptancesBefore = store.state.acceptances.length;
    const auditBefore = store.state.audit.length;
    const res = await as(patient).post('/me/legal-acceptances').send({ documentIds: [legacyPrivacy, legacyPrivacy] });
    expect(res.status).toBe(400);
    expect(store.state.acceptances).toHaveLength(acceptancesBefore);
    expect(store.state.audit).toHaveLength(auditBefore);
  });

  it('[TC-M03-031][N1][RF-04] después de publicar el conjunto del paciente: requisitos nuevos, historia intacta', async () => {
    const acceptancesBefore = store.state.acceptances.filter((a) => [legacyPrivacy, legacyTerms].includes(a.legalDocumentId)).length;
    const policy = store.publishLegalDocument('privacy_policy', '2026-10').id;
    const patientTerms = store.publishLegalDocument('patient_terms', '2026-10').id;

    expect(types((await http().get('/legal-documents/current')).body)).toEqual(['patient_terms', 'privacy_policy']);
    const status = (await as(patientOnLegacy).get('/me/registration-status')).body;
    expect(status.legal.accepted).toBe(false);
    expect(status.missing).toContain('legal');

    // Un id de legado ya no es vigente.
    expect((await as(patientOnLegacy).post('/me/legal-acceptances').send({ documentIds: [legacyPrivacy] })).status).toBe(409);
    expect((await as(patientOnLegacy).post('/me/legal-acceptances').send({ documentIds: [policy, patientTerms] })).status).toBe(201);
    expect((await as(patientOnLegacy).get('/me/registration-status')).body.legal).toEqual({ accepted: true, pending: [] });

    // Las aceptaciones de v1 siguen ahí.
    expect(store.state.acceptances.filter((a) => [legacyPrivacy, legacyTerms].includes(a.legalDocumentId))).toHaveLength(acceptancesBefore);
  });

  it('[TC-M03-032][D-32][R-8] después de publicar doctor_terms, el médico acepta su régimen y cada aceptación queda auditada', async () => {
    const doctorTerms = store.publishLegalDocument('doctor_terms', '2026-10').id;
    const current = (await http().get('/legal-documents/current?audience=doctor')).body as { id: string; type: string }[];
    expect(types(current)).toEqual(['doctor_terms', 'privacy_policy']);
    const policy = current.find((d) => d.type === 'privacy_policy')!.id;
    const patientTerms = (await http().get('/legal-documents/current?audience=patient')).body.find((d: { type: string }) => d.type === 'patient_terms').id;

    const doctor = newDoctor();
    expect((await as(doctor).post('/me/legal-acceptances').send({ documentIds: [patientTerms] })).status).toBe(409);
    const auditBefore = store.state.audit.length;
    const accepted = await as(doctor).post('/me/legal-acceptances').send({ documentIds: [policy, doctorTerms] });
    expect(accepted.status).toBe(201);
    const events = store.state.audit.slice(auditBefore);
    expect(events.map((e) => [e.action, e.entityId])).toEqual([
      ['identity.legal_document.accepted', policy],
      ['identity.legal_document.accepted', doctorTerms],
    ]);

    // El paciente no puede aceptar doctor_terms.
    const patient = await newPatient();
    expect((await as(patient).post('/me/legal-acceptances').send({ documentIds: [doctorTerms] })).status).toBe(409);
  });
});

import { randomUUID } from 'crypto';
import type { Actor } from '../../../../common/application/actor';
import { PRODUCTION_DATABASE } from '../../domain/legal-publication';
import type { LegalDocumentType } from '../../domain/legal-requirements';
import { InMemoryAuditTrail, InMemoryIdentityStore, InMemoryUnitOfWork } from '../../../../../test/support/identity-in-memory';
import { syntheticCurp } from '../../../../../test/support/synthetic-identity';
import {
  AcceptLegalDocumentsUseCase,
  GetCurrentLegalDocumentsUseCase,
  PublishLegalDocumentsUseCase,
} from './legal-documents.use-cases';
import type { AuditTrail } from '../../../audit/application/ports/audit-trail';
import { evaluateLegalAcceptance } from '../../domain/legal-requirements';
import {
  DuplicateLegalDocumentIdsError,
  InvalidLegalPublicationError,
  LegalDocumentNotCurrentError,
  LegalDocumentNotRequiredForRoleError,
  LegalDocumentsNotPublishedError,
  PatientProfileRequiredError,
} from '../../domain/identity.errors';

const TARGET = { branch: 'br-dev-uno', endpoint: 'ep-dev-uno' };
const TARGET_READER = { read: async () => ({ ...TARGET, project: 'p', urlEndpoint: TARGET.endpoint }) };
const inAMinute = () => new Date(Date.now() + 60_000);

// Flujo real del CLI: simular y publicar con la confirmación resultante.
async function publishConfirmed(
  publish: PublishLegalDocumentsUseCase,
  input: { audience: 'patient' | 'doctor'; documents: { type: LegalDocumentType; version: string; content: string }[]; publishedAt?: Date },
) {
  const request = { ...input, publishedAt: input.publishedAt ?? inAMinute(), declaredTarget: TARGET };
  const { confirmation } = await publish.simulate(request);
  return (await publish.execute({ ...request, confirmation, authorizations: { acceptRegimeTransition: true } })).published;
}

function setup() {
  const store = new InMemoryIdentityStore();
  const uow = new InMemoryUnitOfWork(store);
  const audit = new InMemoryAuditTrail(store);
  return {
    store,
    uow,
    current: new GetCurrentLegalDocumentsUseCase(store),
    accept: new AcceptLegalDocumentsUseCase(uow, audit, store),
    audit,
    publish: new PublishLegalDocumentsUseCase(uow, audit, store, TARGET_READER),
  };
}

type Env = ReturnType<typeof setup>;

async function actorWithRole(env: Env, role: 'patient' | 'doctor' | 'admin'): Promise<Actor> {
  const userId = `${role}-${randomUUID()}`;
  const base = { userId, firstName: 'Prueba', lastName: 'Legal' };
  const userProfileId =
    role === 'doctor'
      ? env.store.createDoctorForTest({ ...base, curp: syntheticCurp() })
      : role === 'admin'
        ? await env.store.createAdmin(base)
        : await env.store.createPatient({ ...base, curp: syntheticCurp(), birthDate: '1990-01-01', phone: null, emergencyContactName: null, emergencyContactPhone: null });
  return { userId, userProfileId, role, ipAddress: '127.0.0.1', userAgent: 'jest' };
}

const legacy = (env: Env) => ({
  privacy: env.store.publishLegalDocument('privacy_notice', 'v1'),
  terms: env.store.publishLegalDocument('terms_and_conditions', 'v1'),
});

const auditActions = (env: Env) => env.store.state.audit.map((event) => event.action);

describe('Documentos legales por rol (M03 D-32, N1, R-8; plan v2 §6)', () => {
  describe('GetCurrentLegalDocuments', () => {
    it('[TC-M03-010][N1] antes de publicar: el paciente ve el legado v1 y el médico no tiene documentos (409)', async () => {
      const env = setup();
      const { privacy, terms } = legacy(env);
      expect((await env.current.execute()).map((d) => d.id).sort()).toEqual([privacy.id, terms.id].sort());
      expect((await env.current.execute('patient')).map((d) => d.type).sort()).toEqual(['privacy_notice', 'terms_and_conditions']);
      await expect(env.current.execute('doctor')).rejects.toThrow(LegalDocumentsNotPublishedError);
    });

    it('[TC-M03-011][N1] después de publicar cada conjunto, cada rol ve solo los documentos de su régimen', async () => {
      const env = setup();
      legacy(env);
      env.store.publishLegalDocument('privacy_policy', '2026-10');
      env.store.publishLegalDocument('patient_terms', '2026-10');
      env.store.publishLegalDocument('doctor_terms', '2026-10');
      expect((await env.current.execute('patient')).map((d) => d.type).sort()).toEqual(['patient_terms', 'privacy_policy']);
      expect((await env.current.execute('doctor')).map((d) => d.type).sort()).toEqual(['doctor_terms', 'privacy_policy']);
    });

    it('[TC-M03-012][N1] una publicación futura todavía no cambia el régimen', async () => {
      const env = setup();
      legacy(env);
      const future = new Date(Date.now() + 3_600_000);
      env.store.publishLegalDocument('privacy_policy', '2026-11', future);
      env.store.publishLegalDocument('patient_terms', '2026-11', future);
      expect((await env.current.execute('patient')).map((d) => d.type).sort()).toEqual(['privacy_notice', 'terms_and_conditions']);
    });
  });

  describe('AcceptLegalDocuments', () => {
    it('[TC-M03-013][R-8] el paciente acepta el legado vigente: guarda la evidencia y un evento por documento nuevo', async () => {
      const env = setup();
      const { privacy, terms } = legacy(env);
      const actor = await actorWithRole(env, 'patient');
      await env.accept.execute(actor, [privacy.id, terms.id]);
      expect(env.store.state.acceptances.map((a) => a.legalDocumentId).sort()).toEqual([privacy.id, terms.id].sort());
      expect(auditActions(env)).toEqual(['identity.legal_document.accepted', 'identity.legal_document.accepted']);
      expect(env.store.state.audit[0]).toMatchObject({ entityType: 'legal_document', metadata: { type: expect.any(String), version: 'v1' } });

      // Repetir la aceptación no duplica la evidencia ni el evento.
      await env.accept.execute(actor, [privacy.id]);
      expect(env.store.state.acceptances).toHaveLength(2);
      expect(auditActions(env)).toHaveLength(2);
    });

    it('[TC-M03-014][N1] después de la transición, un id de legado ya no es vigente para el paciente (409)', async () => {
      const env = setup();
      const { privacy } = legacy(env);
      env.store.publishLegalDocument('privacy_policy', '2026-10');
      const patientTerms = env.store.publishLegalDocument('patient_terms', '2026-10');
      const actor = await actorWithRole(env, 'patient');
      await expect(env.accept.execute(actor, [privacy.id, patientTerms.id])).rejects.toThrow(LegalDocumentNotCurrentError);
      expect(env.store.state.acceptances).toHaveLength(0);
      expect(env.store.state.audit).toHaveLength(0);
    });

    it('[TC-M03-015][D-32] el médico acepta privacy_policy + doctor_terms; patient_terms no le corresponde (409)', async () => {
      const env = setup();
      legacy(env);
      const policy = env.store.publishLegalDocument('privacy_policy', '2026-10');
      const doctorTerms = env.store.publishLegalDocument('doctor_terms', '2026-10');
      const patientTerms = env.store.publishLegalDocument('patient_terms', '2026-10');
      const doctor = await actorWithRole(env, 'doctor');
      await expect(env.accept.execute(doctor, [patientTerms.id])).rejects.toThrow(LegalDocumentNotRequiredForRoleError);
      await env.accept.execute(doctor, [policy.id, doctorTerms.id]);
      expect(auditActions(env)).toEqual(['identity.legal_document.accepted', 'identity.legal_document.accepted']);

      const patient = await actorWithRole(env, 'patient');
      await expect(env.accept.execute(patient, [doctorTerms.id])).rejects.toThrow(LegalDocumentNotRequiredForRoleError);
    });

    it('[TC-M03-016][D-32] sin régimen del médico publicado, su aceptación responde 409', async () => {
      const env = setup();
      const { privacy } = legacy(env);
      const doctor = await actorWithRole(env, 'doctor');
      await expect(env.accept.execute(doctor, [privacy.id])).rejects.toThrow(LegalDocumentsNotPublishedError);
    });

    it('[TC-M03-017][RF-02] admin o una cuenta sin perfil no aceptan documentos legales', async () => {
      const env = setup();
      const { privacy } = legacy(env);
      await expect(env.accept.execute(await actorWithRole(env, 'admin'), [privacy.id])).rejects.toThrow(PatientProfileRequiredError);
      const noProfile: Actor = { userId: 'sin-perfil', userProfileId: null, role: null, ipAddress: null, userAgent: null };
      await expect(env.accept.execute(noProfile, [privacy.id])).rejects.toThrow(PatientProfileRequiredError);
    });

    it('[TC-M03-018][R-8] si la transacción falla, no queda ni la aceptación ni el evento (misma UoW)', async () => {
      const env = setup();
      const { privacy, terms } = legacy(env);
      const actor = await actorWithRole(env, 'patient');
      env.uow.failNext = new Error('fallo simulado al confirmar');
      await expect(env.accept.execute(actor, [privacy.id, terms.id])).rejects.toThrow('fallo simulado');
      expect(env.store.state.acceptances).toHaveLength(0);
      expect(env.store.state.audit).toHaveLength(0);
    });

    it('[TC-M03-026][R-8] si la auditoría falla, la aceptación tampoco se guarda (misma UoW)', async () => {
      const env = setup();
      const { privacy, terms } = legacy(env);
      const actor = await actorWithRole(env, 'patient');
      const failingAudit: AuditTrail = { record: async () => { throw new Error('fallo simulado de auditoría'); } };
      const accept = new AcceptLegalDocumentsUseCase(env.uow, failingAudit, env.store);
      await expect(accept.execute(actor, [privacy.id, terms.id])).rejects.toThrow('fallo simulado de auditoría');
      expect(env.store.state.acceptances).toHaveLength(0);
    });

    it('[TC-M03-027][R-13][RF-04] una versión nueva de doctor_terms invalida la aceptación anterior del médico', async () => {
      const env = setup();
      const policy = env.store.publishLegalDocument('privacy_policy', '1', new Date(Date.now() - 120_000));
      const terms1 = env.store.publishLegalDocument('doctor_terms', '1', new Date(Date.now() - 120_000));
      const doctor = await actorWithRole(env, 'doctor');
      await env.accept.execute(doctor, [policy.id, terms1.id]);
      expect(evaluateLegalAcceptance('doctor', (await env.store.read(doctor.userId)).currentLegalDocuments).accepted).toBe(true);

      const terms2 = env.store.publishLegalDocument('doctor_terms', '2');
      const status = evaluateLegalAcceptance('doctor', (await env.store.read(doctor.userId)).currentLegalDocuments);
      expect(status).toEqual({ accepted: false, pending: [{ type: 'doctor_terms', documentId: terms2.id, version: '2' }] });
      await expect(env.accept.execute(doctor, [terms1.id])).rejects.toThrow(LegalDocumentNotCurrentError);
      await env.accept.execute(doctor, [terms2.id]);
      expect(evaluateLegalAcceptance('doctor', (await env.store.read(doctor.userId)).currentLegalDocuments).accepted).toBe(true);
    });

    it('[TC-M03-029][R-8] ids duplicados → 400 sin abrir la transacción, sin aceptaciones ni eventos', async () => {
      const env = setup();
      const { privacy, terms } = legacy(env);
      const actor = await actorWithRole(env, 'patient');
      await expect(env.accept.execute(actor, [privacy.id, privacy.id])).rejects.toThrow(DuplicateLegalDocumentIdsError);
      await expect(env.accept.execute(actor, [privacy.id, terms.id, privacy.id])).rejects.toThrow(DuplicateLegalDocumentIdsError);
      expect(env.uow.calls).toBe(0);
      expect(env.store.state.acceptances).toHaveLength(0);
      expect(env.store.state.audit).toHaveLength(0);
    });

    it('[TC-M03-048][R-8] aunque el repositorio devolviera ids repetidos, cada documento genera a lo más un evento', async () => {
      const env = setup();
      const { privacy, terms } = legacy(env);
      const actor = await actorWithRole(env, 'patient');
      const repeating = Object.assign(Object.create(env.store), {
        recordAcceptances: async (input: Parameters<typeof env.store.recordAcceptances>[0]) => {
          const ids = await env.store.recordAcceptances(input);
          return [...ids, ...ids];
        },
      });
      await new AcceptLegalDocumentsUseCase(env.uow, new InMemoryAuditTrail(env.store), repeating).execute(actor, [privacy.id, terms.id]);
      expect(env.store.state.audit.map((e) => e.entityId)).toEqual([privacy.id, terms.id]);
    });

    it('[TC-M03-019][RF-04] una versión inexistente u obsoleta invalida toda la petición', async () => {
      const env = setup();
      const old = env.store.publishLegalDocument('privacy_notice', 'v0', new Date(Date.now() - 120_000));
      const { terms } = legacy(env);
      const actor = await actorWithRole(env, 'patient');
      await expect(env.accept.execute(actor, [old.id, terms.id])).rejects.toThrow(LegalDocumentNotCurrentError);
      await expect(env.accept.execute(actor, [randomUUID()])).rejects.toThrow(LegalDocumentNotCurrentError);
      expect(env.store.state.acceptances).toHaveLength(0);
    });
  });

  describe('PublishLegalDocuments (CLI legal:publish)', () => {
    const text = (type: string) => `Texto sintético de ${type}`;

    it('[TC-M03-020][N1] publica el conjunto completo del paciente con un published_at común y un evento por documento', async () => {
      const env = setup();
      legacy(env);
      const at = inAMinute();
      const published = await publishConfirmed(env.publish, {
        audience: 'patient',
        publishedAt: at,
        documents: [
          { type: 'privacy_policy', version: '2026-10', content: text('privacy_policy') },
          { type: 'patient_terms', version: '2026-10', content: text('patient_terms') },
        ],
      });
      expect(published.map((d) => d.publishedAt.getTime())).toEqual([at.getTime(), at.getTime()]);
      expect(env.store.state.audit.map((e) => [e.action, e.actor.type])).toEqual([
        ['identity.legal_document.published', 'system'],
        ['identity.legal_document.published', 'system'],
      ]);
      env.store.now = () => new Date(at.getTime() + 1);
      expect((await env.current.execute('patient')).map((d) => d.type).sort()).toEqual(['patient_terms', 'privacy_policy']);
    });

    it.each([
      ['un tipo de legado', 'patient', [{ type: 'privacy_notice', version: 'v2' }], 'legado'],
      ['un tipo de otro rol', 'patient', [{ type: 'privacy_policy', version: '1' }, { type: 'doctor_terms', version: '1' }], 'régimen de patient'],
      ['una publicación parcial', 'patient', [{ type: 'privacy_policy', version: '1' }], 'Publicación parcial'],
      ['un tipo repetido', 'doctor', [{ type: 'doctor_terms', version: '1' }, { type: 'doctor_terms', version: '2' }], 'más de una vez'],
      ['una versión vacía', 'doctor', [{ type: 'privacy_policy', version: ' ' }, { type: 'doctor_terms', version: '1' }], 'versión'],
      ['un conjunto vacío', 'doctor', [], 'No hay documentos'],
    ] as const)('[TC-M03-021][N1] rechaza %s sin escribir nada', async (_case, audience, docs, message) => {
      const env = setup();
      legacy(env);
      const before = env.store.state.legalDocuments.length;
      const error = await env.publish
        .simulate({ audience, documents: docs.map((d) => ({ ...d, content: text(d.type) })), publishedAt: inAMinute(), declaredTarget: TARGET })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(InvalidLegalPublicationError);
      expect((error as Error).message).toContain(message);
      expect(env.store.state.legalDocuments).toHaveLength(before);
      expect(env.store.state.audit).toHaveLength(0);
    });

    it('[TC-M03-028][R-8] si la auditoría falla, no se publica ningún documento', async () => {
      const env = setup();
      const failingAudit: AuditTrail = { record: async () => { throw new Error('fallo simulado de auditoría'); } };
      const publish = new PublishLegalDocumentsUseCase(env.uow, failingAudit, env.store, TARGET_READER);
      await expect(
        publishConfirmed(publish, {
          audience: 'doctor',
          documents: [
            { type: 'privacy_policy', version: '1', content: text('privacy_policy') },
            { type: 'doctor_terms', version: '1', content: text('doctor_terms') },
          ],
        }),
      ).rejects.toThrow('fallo simulado de auditoría');
      expect(env.store.state.legalDocuments).toHaveLength(0);
    });

    it('[TC-M03-022][R-13] con el régimen vigente, se puede publicar una sola versión nueva (p. ej., doctor_terms v2)', async () => {
      const env = setup();
      env.store.publishLegalDocument('privacy_policy', '1');
      env.store.publishLegalDocument('doctor_terms', '1');
      const published = await publishConfirmed(env.publish, {
        audience: 'doctor',
        documents: [{ type: 'doctor_terms', version: '2', content: text('doctor_terms') }],
      });
      expect(published).toHaveLength(1);
    });

    it('[TC-M03-023][N1] el médico puede omitir privacy_policy si ya está vigente', async () => {
      const env = setup();
      env.store.publishLegalDocument('privacy_policy', '1');
      env.store.publishLegalDocument('patient_terms', '1');
      await expect(
        publishConfirmed(env.publish, { audience: 'doctor', documents: [{ type: 'doctor_terms', version: '1', content: text('doctor_terms') }] }),
      ).resolves.toHaveLength(1);
    });

    describe('flujo seguro del CLI', () => {
      const request = () => ({
        audience: 'doctor' as const, documents: [{ type: 'doctor_terms' as const, version: '2', content: 'Texto' }], publishedAt: inAMinute(), declaredTarget: TARGET,
      });
      const regime = (env: Env) => {
        env.store.publishLegalDocument('privacy_policy', '1');
        env.store.publishLegalDocument('doctor_terms', '1');
      };

      it('[TC-M03-249] la simulación no escribe documentos, aceptaciones ni auditoría', async () => {
        const env = setup();
        regime(env);
        await env.publish.simulate(request());
        expect(env.store.state.legalDocuments).toHaveLength(2);
        expect(env.store.state.acceptances).toHaveLength(0);
        expect(env.store.state.audit).toHaveLength(0);
      });

      it('[TC-M03-250] un contenido vacío se rechaza', async () => {
        const env = setup();
        regime(env);
        await expect(env.publish.simulate({ ...request(), documents: [{ type: 'doctor_terms', version: '2', content: '  ' }] })).rejects.toThrow('vacío');
      });

      it('[TC-M03-251] sin confirmación vigente o con contenido distinto no se escribe nada', async () => {
        const env = setup();
        regime(env);
        const req = request();
        const { confirmation } = await env.publish.simulate(req);
        await expect(env.publish.execute({ ...req, confirmation: 'x', authorizations: {} })).rejects.toThrow('formato');
        const changed = { ...req, documents: [{ ...req.documents[0], content: 'Otro' }] };
        await expect(env.publish.execute({ ...changed, confirmation, authorizations: {} })).rejects.toThrow('cambió');
        const clock = env.store.now;
        env.store.now = () => new Date(clock().getTime() + 16 * 60_000);
        await expect(env.publish.execute({ ...req, publishedAt: new Date(Date.now() + 3_600_000), confirmation, authorizations: {} })).rejects.toThrow('caducó');
        expect(env.store.state.legalDocuments).toHaveLength(2);
      });

      it('[TC-M03-252] una transición de régimen exige autorización explícita, aunque la confirmación sea válida', async () => {
        const env = setup();
        regime(env);
        const req = { ...request(), audience: 'patient' as const, documents: [{ type: 'patient_terms' as const, version: '1', content: 'Texto' }] };
        const { confirmation } = await env.publish.simulate(req);
        await expect(env.publish.execute({ ...req, confirmation, authorizations: {} })).rejects.toThrow('regime_transition');
        expect(env.store.state.legalDocuments).toHaveLength(2);
      });

      it('[TC-M03-253] producción: sin --allow-production no se escribe', async () => {
        const env = setup();
        regime(env);
        const production = { branch: PRODUCTION_DATABASE.branch, endpoint: PRODUCTION_DATABASE.endpoint };
        const publish = new PublishLegalDocumentsUseCase(env.uow, env.audit, env.store, { read: async () => ({ ...production, project: 'p', urlEndpoint: production.endpoint }) });
        const req = { ...request(), declaredTarget: production };
        const { plan, confirmation } = await publish.simulate(req);
        expect(plan.target.kind).toBe('production');
        await expect(publish.execute({ ...req, confirmation, authorizations: {} })).rejects.toThrow('production_target');
        expect(env.store.state.legalDocuments).toHaveLength(2);
      });

      it('[TC-M03-254] un destino no verificable se rechaza antes de leer los documentos', async () => {
        const env = setup();
        const publish = new PublishLegalDocumentsUseCase(env.uow, env.audit, env.store, { read: async () => ({ branch: null, endpoint: null, project: null, urlEndpoint: null }) });
        await expect(publish.simulate(request())).rejects.toThrow('No se pudo verificar');
      });
    });
  });
});

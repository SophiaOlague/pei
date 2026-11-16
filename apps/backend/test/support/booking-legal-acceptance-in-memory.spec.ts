import { InMemoryIdentityStore } from './identity-in-memory';

// Doble en memoria del lector BOOKING_LEGAL_ACCEPTANCE_READER (AP-26): la misma regla de documentos vigentes que
// findCurrent y los ids de aceptación que asigna recordAcceptances. Sin BD.
function patientStore() {
  const store = new InMemoryIdentityStore();
  const userProfileId = 'up-paciente';
  store.state.userProfiles.push({ id: userProfileId, userId: 'u-paciente', role: 'patient' } as never);
  return { store, userProfileId };
}
const accept = (store: InMemoryIdentityStore, userProfileId: string, legalDocumentIds: string[]) =>
  store.recordAcceptances({ userProfileId, legalDocumentIds, ipAddress: null, userAgent: null });
const acceptanceIdOf = (store: InMemoryIdentityStore, userProfileId: string, legalDocumentId: string) =>
  store.state.acceptances.find((a) => a.userProfileId === userProfileId && a.legalDocumentId === legalDocumentId)?.id;

describe('InMemoryIdentityStore.currentFor (AP-26)', () => {
  it('[TC-M02-255][AP-26] devuelve las dos aceptaciones vigentes con el id que asignó recordAcceptances', async () => {
    const { store, userProfileId } = patientStore();
    const pp = store.publishLegalDocument('privacy_policy', 'v1');
    const pt = store.publishLegalDocument('patient_terms', 'v1');
    await accept(store, userProfileId, [pp.id, pt.id]);
    const result = await store.currentFor(userProfileId);
    expect(result).toEqual({
      regime: 'current',
      privacy: { acceptanceId: acceptanceIdOf(store, userProfileId, pp.id), legalDocumentId: pp.id, type: 'privacy_policy', version: 'v1' },
      terms: { acceptanceId: acceptanceIdOf(store, userProfileId, pt.id), legalDocumentId: pt.id, type: 'patient_terms', version: 'v1' },
    });
    expect(result!.privacy.acceptanceId).not.toBe(result!.terms.acceptanceId);
  });

  it('[TC-M02-256][AP-26] null sin aceptación completa, con una versión nueva no aceptada y para otro rol o un perfil inexistente', async () => {
    const { store, userProfileId } = patientStore();
    const pp = store.publishLegalDocument('privacy_policy', 'v1');
    const pt = store.publishLegalDocument('patient_terms', 'v1', new Date(Date.now() - 120_000));
    await accept(store, userProfileId, [pp.id]);
    expect(await store.currentFor(userProfileId)).toBeNull();
    await accept(store, userProfileId, [pt.id]);
    expect(await store.currentFor(userProfileId)).not.toBeNull();
    store.publishLegalDocument('patient_terms', 'v2', new Date(Date.now() - 30_000));
    expect(await store.currentFor(userProfileId)).toBeNull();
    store.state.userProfiles.push({ id: 'up-medico', userId: 'u-medico', role: 'doctor' } as never);
    await accept(store, 'up-medico', [pp.id]);
    expect(await store.currentFor('up-medico')).toBeNull();
    expect(await store.currentFor('no-existe')).toBeNull();
  });
});

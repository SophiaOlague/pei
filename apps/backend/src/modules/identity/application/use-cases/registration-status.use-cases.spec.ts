import type { Actor } from '../../../../common/application/actor';
import type { Role } from '../../../../common/domain/role';
import { computeRegistrationStatus, type RegistrationSnapshot } from '../../domain/registration-status';
import { NotAPatientError } from '../../domain/identity.errors';
import type { RegistrationStatusReader } from '../ports/registration-status-reader';
import { GetRegistrationStatusUseCase } from './registration-status.use-cases';

const patientSnapshot: RegistrationSnapshot = {
  role: 'patient',
  hasPatientProfile: true,
  currentLegalDocuments: [
    { type: 'privacy_notice', documentId: '00000000-0000-4000-8000-000000000001', version: 'v1', accepted: true },
    { type: 'terms_and_conditions', documentId: '00000000-0000-4000-8000-000000000002', version: 'v1', accepted: true },
  ],
  latestIdentityVerification: { status: 'pending', rejectionReason: null },
};

const actor = (role: Role | null): Actor => ({
  userId: 'user-1',
  userProfileId: role ? '00000000-0000-4000-8000-0000000000aa' : null,
  role,
  ipAddress: null,
  userAgent: null,
});

function setup(snapshot: RegistrationSnapshot = patientSnapshot) {
  const read = jest.fn<Promise<RegistrationSnapshot>, [string]>().mockResolvedValue(snapshot);
  const reader: RegistrationStatusReader = { read };
  return { useCase: new GetRegistrationStatusUseCase(reader), read };
}

describe('GetRegistrationStatusUseCase: estado compuesto por rol (M03 A4)', () => {
  it('[TC-M03-064][M02-6][D-31] paciente: GET /me recibe exactamente el estado del paciente', async () => {
    const { useCase, read } = setup();
    await expect(useCase.executeForActor(actor('patient'))).resolves.toEqual(computeRegistrationStatus(patientSnapshot));
    expect(read).toHaveBeenCalledWith('user-1');
  });

  it('[TC-M03-065][M02-6] cuenta sin perfil: recibe el estado del paciente (todo pendiente)', async () => {
    const empty: RegistrationSnapshot = { role: null, hasPatientProfile: false, currentLegalDocuments: [], latestIdentityVerification: null };
    const { useCase } = setup(empty);
    await expect(useCase.executeForActor(actor(null))).resolves.toEqual(computeRegistrationStatus(empty));
  });

  it.each(['doctor', 'admin', 'organization'] as const)('[TC-M03-066][M02-6][D-A4-2] %s: null sin consultar la BD', async (role) => {
    const { useCase, read } = setup();
    await expect(useCase.executeForActor(actor(role))).resolves.toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it('[TC-M03-067][D-A4-2] GET /me/registration-status sigue reservado al paciente: el médico recibe NotAPatientError', async () => {
    const { useCase, read } = setup();
    await expect(useCase.execute(actor('doctor'))).rejects.toBeInstanceOf(NotAPatientError);
    expect(read).not.toHaveBeenCalled();
  });
});

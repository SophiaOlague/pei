import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { getDbContext } from '../../src/db/transaction-context';
import { DrizzleUnitOfWork } from '../../src/common/infrastructure/drizzle-unit-of-work';
import { GetRegistrationStatusUseCase } from '../../src/modules/identity/application/use-cases/registration-status.use-cases';
import { RegistrationIncompleteError } from '../../src/modules/identity/domain/identity.errors';
import { DrizzleRegistrationStatusReader } from '../../src/modules/identity/infrastructure/persistence/drizzle-registration-status.reader';
import { INITIAL_POLICY } from '../../src/modules/appointments/domain/cancellation-policy';
import { addLocalDays, localDateString } from '../../src/modules/appointments/domain/local-date';
import { SessionEngine } from '../../src/modules/video/application/session-engine';
import { PatientSessionUseCases } from '../../src/modules/video/application/use-cases/patient-session.use-cases';
import { SessionAccess } from '../../src/modules/video/application/use-cases/session-access';
import { RandomUuidGenerator } from '../../src/modules/video/infrastructure/doctor-operational.adapter';
import { DrizzleMeetingRepository } from '../../src/modules/video/infrastructure/persistence/drizzle-meeting.repository';
import { assertC2BranchTarget } from '../support/c2-target-guard';
import { captureError, withRollback } from '../support/with-rollback';
import { FixedClock } from '../support/appointments-in-memory';
import { FakeVideoProvider } from '../support/video-in-memory';
import { appointmentsUseCases, bookablePatient, countM08Residue, firstSlot, newAdmin, operatingDoctor } from '../support/appointments-integration';
import { createPatient, identityUseCases } from '../support/identity-integration';

// Salvaguarda de destino: solo contra la rama de pruebas mediante C2.
assertC2BranchTarget();

// D-37 / RN-140 contra PostgreSQL (rollback): la reaceptación de una versión legal nueva se distingue del primer
// registro con las aceptaciones guardadas (user_legal_acceptance), no con datos del cliente. Agendar sigue bloqueado
// en la API; entrar a la sala de una cita ya confirmada, no.

const tx = () => getDbContext();
const status = () => new GetRegistrationStatusUseCase(new DrizzleRegistrationStatusReader());

// Régimen del paciente vigente ANTES de now() (para poder publicar después una versión más nueva en la misma
// transacción: legal_document tiene UNIQUE(type, published_at) y now() es fijo).
async function regimeBeforeNow() {
  for (const type of ['privacy_policy', 'patient_terms']) {
    const { rows } = await tx().execute<{ published_at: Date }>(sql`select published_at from legal_document where type = ${type} and published_at <= now() order by published_at desc limit 1`);
    if (!rows[0]) {
      await tx().execute(sql`insert into legal_document (type, version, content, published_at) values (${type}, ${`reac-base-${Math.random()}`}, 'Texto sintético', now() - interval '1 minute')`);
    } else if (new Date(rows[0].published_at).getTime() === (await dbNow()).getTime()) {
      throw new Error(`Hay un ${type} publicado en el mismo instante de la transacción: no se puede publicar una versión más nueva`);
    }
  }
}
async function dbNow() {
  return new Date((await tx().execute<{ now: Date }>(sql`select now() as now`)).rows[0].now);
}
// Versión nueva de los términos del paciente, vigente desde now(): invalida la aceptación anterior (RF-04). Se usa
// patient_terms porque el fixture del médico ya publica privacy_policy en now() dentro de la transacción.
async function publishNewPatientTerms() {
  await tx().execute(sql`insert into legal_document (type, version, content, published_at) values ('patient_terms', ${`reac-new-${Math.random()}`}, 'Texto sintético nuevo', now())`);
}

describe('Reaceptación legal frente al registro inicial (C2, rollback)', () => {
  let before: Record<string, number>;
  beforeAll(async () => {
    before = await withRollback(() => countM08Residue());
  });
  afterAll(async () => {
    try {
      expect(await withRollback(() => countM08Residue())).toEqual(before);
    } finally {
      await db.$client.end();
      expect(db.$client.totalCount).toBe(0);
    }
  });

  it('[TC-M02-310] primer registro sin aceptación: legal pendiente y NO es reaceptación', () =>
    withRollback(async () => {
      await regimeBeforeNow();
      const p = await createPatient(identityUseCases());
      const s = await status().execute(p);
      expect(s.profileCompleted).toBe(true);
      expect(s.legal.accepted).toBe(false);
      expect(s.legal.reacceptanceRequired).toBe(false);
      expect(s.canBookAppointments).toBe(false);
    }));

  it('[TC-M02-311][RN-140] versión nueva pendiente: reaceptación; agendar sigue rechazado por la API; la sala de una cita confirmada sigue abierta', () =>
    withRollback(async () => {
      await regimeBeforeNow();
      const clock = new FixedClock(new Date());
      const uc = appointmentsUseCases(clock);
      const admin = await newAdmin();
      if (await captureError(uc.prices.current(admin))) await uc.prices.publish(admin, '200.00', 'initial_setup');
      if (await captureError(uc.policies.current(admin))) await uc.policies.publish(admin, { ...INITIAL_POLICY }, 'initial_setup');
      const doctor = await operatingDoctor(uc, admin);
      const patient = await bookablePatient(admin, false);
      expect((await status().execute(patient)).legal).toMatchObject({ accepted: true, reacceptanceRequired: false });

      // Cita confirmada ANTES de la versión nueva.
      const day = addLocalDays(localDateString(clock.now()), 2);
      const startsAt = await firstSlot(uc, doctor.doctorProfileId, day);
      const hold = await uc.hold.execute(patient, { doctorProfileId: doctor.doctorProfileId, startsAt, reason: 'Reaceptación C2' });
      expect(await uc.confirmation.confirmPaid(hold.id, 'pay-reac-c2', hold.price)).toEqual({ result: 'confirmed' });

      await publishNewPatientTerms();
      const s = await status().execute(patient);
      expect(s.legal.accepted).toBe(false);
      expect(s.legal.reacceptanceRequired).toBe(true);
      expect(s.legal.pending.map((d) => d.type)).toEqual(['patient_terms']);
      expect(s.canBookAppointments).toBe(false);

      // RN-140: agendar sigue protegido en la API.
      const otherSlot = await firstSlot(uc, doctor.doctorProfileId, day, 1);
      const rejected = await captureError(uc.hold.execute(patient, { doctorProfileId: doctor.doctorProfileId, startsAt: otherSlot, reason: 'No debe reservarse' }));
      expect(rejected).toBeInstanceOf(RegistrationIncompleteError);
      expect((rejected as RegistrationIncompleteError).missing).toContain('legal');
      const { rows } = await tx().execute<{ n: string }>(sql`select count(*) as n from appointment where patient_id = (select id from patient_profile where user_profile_id = ${patient.userProfileId})`);
      expect(Number(rows[0].n)).toBe(1);

      // La sala de su cita confirmada no exige la aceptación legal vigente (RN-140 solo restringe agendar).
      const uow = new DrizzleUnitOfWork();
      const meetings = new DrizzleMeetingRepository();
      const engine = new SessionEngine(meetings, new RandomUuidGenerator(), clock, uc.session);
      const video = new PatientSessionUseCases(uow, engine, new SessionAccess(meetings, new FakeVideoProvider()));
      clock.current = startsAt;
      expect((await video.enter(patient, hold.id)).patient.present).toBe(true);

      // Al aceptar la versión nueva con el mecanismo existente, se restablece sin reabrir nada (RF-04).
      await identityUseCases().acceptLegal.execute(patient, s.legal.pending.map((d) => d.documentId));
      expect((await status().execute(patient)).legal).toMatchObject({ accepted: true, reacceptanceRequired: false });
    }), 240_000);
});

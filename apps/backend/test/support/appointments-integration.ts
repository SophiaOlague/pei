import { sql } from 'drizzle-orm';
import { getDbContext } from '../../src/db/transaction-context';
import type { Actor } from '../../src/common/application/actor';
import { DrizzleUnitOfWork } from '../../src/common/infrastructure/drizzle-unit-of-work';
import { DrizzleAuditTrail } from '../../src/modules/audit/infrastructure/drizzle-audit-trail';
import { AgendaService } from '../../src/modules/agenda/application/use-cases/agenda.use-cases';
import { NoBusyIntervalsProvider } from '../../src/modules/agenda/application/ports/busy-intervals.provider';
import { DrizzleAgendaRepository } from '../../src/modules/agenda/infrastructure/persistence/drizzle-agenda.repository';
import { CanBookAppointmentsPolicy } from '../../src/modules/identity/application/policies/can-book-appointments';
import { DrizzleRegistrationStatusReader } from '../../src/modules/identity/infrastructure/persistence/drizzle-registration-status.reader';
import {
  DoctorAppointmentsQuery, DoctorOccupancyService, GetDoctorSlotsForPatientUseCase, HoldSlotUseCase, ListBookableDoctorsUseCase, PatientAppointmentsQuery,
  PatientSlotsService, ReleaseHoldUseCase,
} from '../../src/modules/appointments/application/use-cases/booking.use-cases';
import { CancelByDoctorUseCase, CancelByPatientUseCase } from '../../src/modules/appointments/application/use-cases/cancellation.use-cases';
import { CancellationPolicyService, ConsultationPriceService } from '../../src/modules/appointments/application/use-cases/configuration.use-cases';
import { AppointmentConfirmationService, AppointmentSessionService } from '../../src/modules/appointments/application/integration/appointment-integration.services';
import { DrizzleAppointmentRepository } from '../../src/modules/appointments/infrastructure/persistence/drizzle-appointment.repository';
import { DrizzleCancellationPolicyRepository, DrizzleConsultationPriceRepository } from '../../src/modules/appointments/infrastructure/persistence/drizzle-configuration.repositories';
import { DrizzleBookableDoctorsReader, PolicyBookingEligibility } from '../../src/modules/appointments/infrastructure/adapters';
import type { BookingFeature } from '../../src/modules/appointments/application/ports/appointments.ports';
import { createAdminActor, createPatient, identityUseCases } from './identity-integration';
import { acceptCurrentDoctorRegime, createDoctor, doctorUseCases, JPEG, PDF, specialtyId, type CurrentDoctorRegime } from './doctors-integration';
import { insertAuthUser, sessionActor } from './identity-integration';
import { FixedClock } from './appointments-in-memory';
import { syntheticCurp, syntheticJpeg } from './synthetic-identity';

// M08 contra PostgreSQL: los casos de uso de citas con TODOS los adaptadores reales (Drizzle, auditoría, políticas de
// M02 y M03, AgendaService de M07). Solo el reloj es fijo (para probar la retención de 5 minutos) y la bandera de
// reserva se activa en el propio spec, nunca por variable de entorno.

export const ENABLED: BookingFeature = { enabled: () => true };

export function appointmentsUseCases(clock: FixedClock) {
  const uow = new DrizzleUnitOfWork();
  const audit = new DrizzleAuditTrail();
  const repo = new DrizzleAppointmentRepository();
  const prices = new DrizzleConsultationPriceRepository();
  const policies = new DrizzleCancellationPolicyRepository();
  const doctors = doctorUseCases();
  const eligibility = new PolicyBookingEligibility(new CanBookAppointmentsPolicy(new DrizzleRegistrationStatusReader()), doctors.policy);
  const agenda = new AgendaService(new DrizzleAgendaRepository(), new NoBusyIntervalsProvider(), clock);
  const slots = new PatientSlotsService(agenda, new DoctorOccupancyService(repo), clock);
  return {
    repo, eligibility, agenda, doctors,
    prices: new ConsultationPriceService(uow, audit, prices, clock),
    policies: new CancellationPolicyService(uow, audit, policies, clock),
    hold: new HoldSlotUseCase(uow, audit, repo, prices, policies, eligibility, ENABLED, slots, clock),
    release: new ReleaseHoldUseCase(uow, audit, repo),
    patientQuery: new PatientAppointmentsQuery(repo, clock),
    doctorQuery: new DoctorAppointmentsQuery(repo, clock),
    cancelPatient: new CancelByPatientUseCase(uow, audit, repo, policies, clock),
    cancelDoctor: new CancelByDoctorUseCase(uow, audit, repo, eligibility, clock),
    confirmation: new AppointmentConfirmationService(uow, audit, repo, clock),
    session: new AppointmentSessionService(uow, audit, repo, policies),
    listDoctors: new ListBookableDoctorsUseCase(new DrizzleBookableDoctorsReader(), eligibility, slots, clock),
    doctorSlots: new GetDoctorSlotsForPatientUseCase(slots, eligibility),
  };
}
export type AppointmentsUseCases = ReturnType<typeof appointmentsUseCases>;

// Médico habilitado (canOperate): registro con régimen legal, INE y cédula aprobadas, y una franja de 09:00 a 12:00
// (hora del centro de México) todos los días de la semana.
// Con `regime` (rama persistente, concurrencia) reutiliza los documentos vigentes y NUNCA publica.
export async function operatingDoctor(uc: AppointmentsUseCases, admin: Actor, regime?: CurrentDoctorRegime) {
  const d = regime ? await doctorWithRegime(uc, regime) : await createDoctor(uc.doctors);
  const ine = await uc.doctors.submitIne.execute(d, { front: JPEG, back: JPEG });
  const lic = await uc.doctors.submitLicense.execute(d, { licenseNumber: `M08${Math.floor(Math.random() * 1e9)}`, document: PDF });
  await uc.doctors.review.execute(admin, 'identity', ine.reviewId, { decision: 'approve' });
  await uc.doctors.review.execute(admin, 'license', lic.reviewId, { decision: 'approve' });
  for (let weekday = 0; weekday < 7; weekday++) {
    await getDbContext().execute(sql`insert into doctor_availability (doctor_id, weekday, start_time, end_time) values (${d.doctorProfileId}, ${weekday}, '09:00', '12:00')`);
  }
  return d;
}

async function doctorWithRegime(uc: AppointmentsUseCases, regime: CurrentDoctorRegime) {
  const userId = await insertAuthUser();
  const actor = sessionActor(userId);
  const { doctorProfileId, userProfileId } = await uc.doctors.register.execute(actor, {
    firstName: 'Médica', lastName: 'Concurrencia M08', curp: syntheticCurp(), specialtyId: await specialtyId('medicina_general'),
  });
  await acceptCurrentDoctorRegime(userProfileId, regime);
  return { ...actor, userProfileId, role: 'doctor' as const, doctorProfileId };
}

// Paciente con registro completo (canBookAppointments): perfil, aceptación de los legales vigentes de su régimen e
// identidad aprobada. Si la rama no tiene documentos del paciente vigentes, los publica dentro de la transacción.
// publish = false (rama persistente): si no hay régimen vigente del paciente, falla en vez de publicar.
export async function bookablePatient(admin: Actor, publish = true) {
  const ids = identityUseCases();
  const p = await createPatient(ids);
  const current = async () => (await getDbContext().execute<{ id: string; type: string }>(sql`
    select distinct on (type) id, type from legal_document
     where published_at <= now() and type in ('privacy_notice', 'terms_and_conditions', 'privacy_policy', 'patient_terms')
     order by type, published_at desc`)).rows;
  let docs = await current();
  const types = new Set(docs.map((d) => d.type));
  const hasRegime = (types.has('privacy_policy') && types.has('patient_terms')) || (types.has('privacy_notice') && types.has('terms_and_conditions'));
  if (!hasRegime && !publish) throw new Error('La rama no tiene documentos legales vigentes del paciente; la concurrencia no publica');
  if (!hasRegime) {
    for (const type of ['privacy_policy', 'patient_terms']) {
      await getDbContext().execute(sql`insert into legal_document (type, version, content, published_at) values (${type}, ${`m08-${Math.random()}`}, 'Texto sintético M08', now()) on conflict do nothing`);
    }
    docs = await current();
  }
  for (const doc of docs) {
    await getDbContext().execute(sql`insert into user_legal_acceptance (user_profile_id, legal_document_id) values (${p.userProfileId}, ${doc.id}) on conflict do nothing`);
  }
  const submitted = await ids.submit.execute(p, { front: syntheticJpeg(), back: syntheticJpeg() });
  await ids.review.execute(admin, submitted.submissionId, { decision: 'approve' });
  return p;
}

export async function newAdmin() {
  return createAdminActor(identityUseCases());
}

export async function auditActions(entityId: string) {
  const { rows } = await getDbContext().execute<{ action: string; actor_type: string; metadata: Record<string, unknown> }>(
    sql`select action, actor_type, metadata from audit_log where entity_id = ${entityId} order by action`,
  );
  return rows;
}

export async function historyOf(appointmentId: string) {
  const { rows } = await getDbContext().execute<{ status: string; changed_by_type: string | null; reason: string | null }>(
    sql`select status, changed_by_type, reason from appointment_status_history where appointment_id = ${appointmentId} order by created_at, status`,
  );
  return rows;
}

// Conteos de las tablas de M08 (solo lectura) para comprobar que no queda residuo.
export async function countM08Residue(): Promise<Record<string, number>> {
  const { rows } = await getDbContext().execute<Record<string, string>>(sql`
    select (select count(*) from appointment) as appointment,
           (select count(*) from appointment_status_history) as appointment_status_history,
           (select count(*) from consultation_price_configuration) as consultation_price_configuration,
           (select count(*) from cancellation_policy) as cancellation_policy`);
  return Object.fromEntries(Object.entries(rows[0]).map(([k, v]) => [k, Number(v)]));
}

// Primer horario libre del día local indicado (del generador real de M07).
export async function firstSlot(uc: AppointmentsUseCases, doctorProfileId: string, day: string, index = 0) {
  const view = await uc.agenda.generateSlots(doctorProfileId, day, day);
  const slot = view.slots[index];
  if (!slot) throw new Error(`Sin horarios el ${day}`);
  return new Date(slot.startsAt);
}

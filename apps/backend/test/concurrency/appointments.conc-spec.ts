import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { transactionStorage } from '../../src/db/transaction-context';
import { SlotUnavailableError } from '../../src/modules/appointments/domain/appointments.errors';
import { INITIAL_POLICY } from '../../src/modules/appointments/domain/cancellation-policy';
import { addLocalDays, localDateString } from '../../src/modules/appointments/domain/local-date';
import { assertC2BranchTarget, C2_PERSISTENT_FIXTURES, C2_TARGET } from '../support/c2-target-guard';
import { captureError, deferred, type Tx } from '../support/with-rollback';
import { assertReusableDoctorRegime, readCurrentDoctorRegime, type CurrentDoctorRegime } from '../support/doctors-integration';
import { FixedClock } from '../support/appointments-in-memory';
import { appointmentsUseCases, bookablePatient, firstSlot, newAdmin, operatingDoctor } from '../support/appointments-integration';
import { assertSchemaHasM1PartA } from '../support/m08-m1-sql';

// M08 etapa 1: concurrencia con DOS conexiones y datos CONFIRMADOS (la segunda conexión debe ver al médico y a los
// pacientes). Solo en la rama C2 persistente aprobada (C2_TARGET, nunca `production`), con conexión directa
// (jest-concurrency.json) y C2_COMMITTED_FIXTURES=c2-persistent-accepted. No publica documentos legales: reutiliza los
// vigentes. H-2: es repetible y compatible con M-1 (versiones de solo cierre, historial de solo inserción):
// - nunca borra ni reabre: cada ejecución usa médicos y pacientes NUEVOS (horarios propios, sin cruces con otras pruebas);
// - marca sus datos: motivo `c2-m08-conc:<RUN>` en cada cita; perfiles con el prefijo sintético de insertAuthUser;
// - al terminar, libera las retenciones que creó (pending_payment → expired, transición legítima) y, si cambió el
//   precio, publica de nuevo 200.00 como versión NUEVA, de modo que la rama queda con la configuración base (AP-1, AP-22).
// Exige 0013 persistente en C2 (Drizzle inserta todas las columnas declaradas): beforeAll lo comprueba antes de confirmar nada.
// Residuo aceptado de la rama persistente: perfiles, citas expiradas, historial y auditoría (consulta en A.14.4).
assertC2BranchTarget();
const allowed = process.env.C2_EXPECTED_BRANCH === C2_TARGET.branch && process.env.C2_COMMITTED_FIXTURES === C2_PERSISTENT_FIXTURES;
if (!allowed) throw new Error(`appointments.conc-spec confirma datos: solo en la rama C2 aprobada con C2_COMMITTED_FIXTURES=${C2_PERSISTENT_FIXTURES}`);

const committed = <T>(work: () => Promise<T>) => db.transaction((tx: Tx) => transactionStorage.run(tx as any, work));

function holdThenCommit(work: () => Promise<unknown>) {
  const done = deferred();
  const release = deferred();
  const outcome = captureError(db.transaction(async (tx: Tx) => {
    await transactionStorage.run(tx as any, work);
    done.resolve();
    await release.promise;
  }));
  const ready = Promise.race([done.promise, outcome.then((e) => { throw e ?? new Error('A terminó antes de tiempo'); })]);
  return { ready, release: () => release.resolve(), outcome };
}

async function waitForLockWait(timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await db.execute<{ n: string }>(sql`select count(*) as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`);
    if (Number(rows[0].n) > 0) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Ninguna sesión quedó esperando un lock');
}

const clock = new FixedClock(new Date());
const uc = appointmentsUseCases(clock);
const day = addLocalDays(localDateString(clock.now()), 2);
let regime: CurrentDoctorRegime;
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const REASON = `c2-m08-conc:${RUN}`;
const created = { doctors: [] as string[], priceChanged: false };
const baseline = { price: '', policy: '' };

async function openIds() {
  const { rows } = await db.execute<{ price: string | null; policy: string | null; prices: string; policies: string }>(sql`
    select (select id from consultation_price_configuration where effective_until is null order by effective_from desc limit 1) as price,
           (select id from cancellation_policy where effective_until is null order by effective_from desc limit 1) as policy,
           (select count(*) from consultation_price_configuration where effective_until is null) as prices,
           (select count(*) from cancellation_policy where effective_until is null) as policies`);
  return rows[0];
}

describe('Concurrencia de citas (M08, dos conexiones, datos confirmados)', () => {
  let admin: Awaited<ReturnType<typeof newAdmin>>;

  beforeAll(async () => {
    await assertSchemaHasM1PartA();
    regime = await committed(() => readCurrentDoctorRegime());
    assertReusableDoctorRegime(regime, new Date());
    admin = await committed(() => newAdmin());
    const price = await captureError(uc.prices.current(admin)) ? null : await uc.prices.current(admin);
    baseline.price = price?.price === '200.00' ? price.id : (await uc.prices.publish(admin, '200.00', 'initial_setup')).id;
    const policy = await captureError(uc.policies.current(admin)) ? null : await uc.policies.current(admin);
    const same = policy && policy.refundDeadlineHours === 24 && policy.maxReschedules === 2 && policy.doctorWaitMinutes === 30 && policy.patientToleranceMinutes === 15;
    baseline.policy = same ? policy.id : (await uc.policies.publish(admin, { ...INITIAL_POLICY }, 'initial_setup')).id;
  });

  afterAll(async () => {
    try {
      const { rows: holds } = await db.execute<{ id: string }>(sql`select id from appointment where reason = ${REASON} and status = 'pending_payment'`);
      for (const h of holds) await uc.confirmation.markPaymentFailed(h.id);
      if (created.priceChanged) await uc.prices.publish(admin, '200.00', 'initial_setup');
      const open = await openIds();
      expect({ prices: open.prices, policies: open.policies, policy: open.policy }).toEqual({ prices: '1', policies: '1', policy: baseline.policy });
      expect((await uc.prices.current(admin)).price).toBe('200.00');
      const { rows: left } = await db.execute<{ n: string }>(sql`select count(*) as n from appointment where reason = ${REASON} and status = 'pending_payment'`);
      expect(left[0].n).toBe('0');
    } finally {
      await db.$client.end();
    }
  });

  async function doctorAndPatients(n: number) {
    const d = await committed(() => operatingDoctor(uc, admin, regime));
    created.doctors.push(d.doctorProfileId);
    const patients = [];
    for (let i = 0; i < n; i++) patients.push(await committed(() => bookablePatient(admin, false)));
    return { d, patients };
  }

  it('[TC-M08-250][RB-1][DA-2] dos pacientes piden el mismo horario a la vez: exactamente uno gana; el otro recibe 409', async () => {
    const { d, patients: [a, b] } = await doctorAndPatients(2);
    const startsAt = await committed(() => firstSlot(uc, d.doctorProfileId, day));
    const results = await Promise.allSettled([
      uc.hold.execute(a, { doctorProfileId: d.doctorProfileId, startsAt, reason: REASON }),
      uc.hold.execute(b, { doctorProfileId: d.doctorProfileId, startsAt, reason: REASON }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(SlotUnavailableError);
    const { rows } = await db.execute<{ n: string }>(sql`select count(*) as n from appointment where doctor_id = ${d.doctorProfileId} and scheduled_at = ${startsAt.toISOString()}`);
    expect(Number(rows[0].n)).toBe(1);
  });

  it('[TC-M08-251][DA-2] orden de candados: la reserva toma el candado del médico ANTES de esperar el del paciente', async () => {
    const { d, patients: [p] } = await doctorAndPatients(1);
    const startsAt = await committed(() => firstSlot(uc, d.doctorProfileId, day));
    // A bloquea al paciente; la reserva de B debe quedarse esperando ya con el médico bloqueado.
    const a = holdThenCommit(() => transactionStorage.getStore()!.execute(sql`select id from patient_profile where id = ${p.patientProfileId} for update`));
    await a.ready;
    const booking = captureError(uc.hold.execute(p, { doctorProfileId: d.doctorProfileId, startsAt, reason: REASON }));
    await waitForLockWait();
    const probe = await captureError(committed(() => transactionStorage.getStore()!.execute(sql`select id from doctor_profile where id = ${d.doctorProfileId} for update nowait`)));
    expect(String((probe as { cause?: { code?: string } })?.cause?.code ?? (probe as { code?: string })?.code)).toBe('55P03');
    a.release();
    expect(await a.outcome).toBeNull();
    expect(await booking).toBeNull();
  });

  it('[TC-M08-252][P-3] dos publicaciones de precio simultáneas dejan una sola versión abierta', async () => {
    const results = await Promise.allSettled([uc.prices.publish(admin, '210.00'), uc.prices.publish(admin, '220.00')]);
    created.priceChanged = true;
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
    const { rows } = await db.execute<{ n: string }>(sql`select count(*) as n from consultation_price_configuration where effective_until is null`);
    expect(Number(rows[0].n)).toBe(1);
  });
});

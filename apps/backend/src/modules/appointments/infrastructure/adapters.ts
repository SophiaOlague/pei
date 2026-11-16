import { Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { Actor } from '../../../common/application/actor';
import { getDbContext } from '../../../db/transaction-context';
import { doctorProfile, specialty, userProfile } from '../../../db/schema';
import { CanBookAppointmentsPolicy } from '../../identity/application/policies/can-book-appointments';
import { DoctorOperationalPolicy } from '../../doctors/application/policies/doctor-operational.policy';
import type { BookableDoctorsReader, BookingEligibility, BookingFeature, DoctorSummary } from '../application/ports/appointments.ports';

// Delega en las políticas existentes de M02 y M03 sin duplicarlas (RN-140: registro, identidad y legales del paciente;
// D-38: canOperate del médico).
@Injectable()
export class PolicyBookingEligibility implements BookingEligibility {
  constructor(
    private readonly patients: CanBookAppointmentsPolicy,
    private readonly doctors: DoctorOperationalPolicy,
  ) {}

  assertPatientCanBook(actor: Actor): Promise<void> {
    return this.patients.assertCanBookAppointments(actor);
  }

  assertDoctorCanOperate(doctorProfileId: string): Promise<void> {
    return this.doctors.assertCanOperate(doctorProfileId);
  }

  async doctorCanOperate(doctorProfileId: string): Promise<boolean> {
    return (await this.doctors.statusOf(doctorProfileId)).canOperate;
  }
}

// AP-16: solo el valor exacto "true" activa la reserva. Sin la variable (desarrollo y la futura producción), queda desactivada.
export const BOOKING_FLAG = 'APPOINTMENTS_BOOKING_ENABLED';

@Injectable()
export class EnvBookingFeature implements BookingFeature {
  enabled(): boolean {
    return process.env[BOOKING_FLAG] === 'true';
  }
}

// CC-6 (AP-12): solo nombre para mostrar y especialidad. Sin CURP, cédula, contacto, biografía ni foto.
@Injectable()
export class DrizzleBookableDoctorsReader implements BookableDoctorsReader {
  async listCandidates(specialtyId?: string): Promise<DoctorSummary[]> {
    const query = getDbContext()
      .select({ doctorProfileId: doctorProfile.id, firstName: userProfile.firstName, lastName: userProfile.lastName, specialtyId: specialty.id, specialtyName: specialty.name })
      .from(doctorProfile)
      .innerJoin(userProfile, eq(userProfile.id, doctorProfile.userProfileId))
      .innerJoin(specialty, eq(specialty.id, doctorProfile.specialtyId));
    const rows = await (specialtyId ? query.where(eq(doctorProfile.specialtyId, specialtyId)) : query).orderBy(asc(userProfile.lastName), asc(userProfile.firstName));
    return rows.map((r) => ({ doctorProfileId: r.doctorProfileId, displayName: `${r.firstName} ${r.lastName}`.trim(), specialty: { id: r.specialtyId, name: r.specialtyName } }));
  }
}

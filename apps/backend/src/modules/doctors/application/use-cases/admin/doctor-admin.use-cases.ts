import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../../../../common/application/actor';
import { DOCTOR_IDENTITY_GATEWAY, type DoctorIdentityGateway } from '../../../../identity/application/ports/doctor-identity.gateway';
import type { DoctorGlobalStatus, DoctorStatus } from '../../../domain/doctor-status';
import { DoctorNotFoundError } from '../../../domain/doctor.errors';
import { DOCTOR_PROFILE_REPOSITORY, type DoctorProfileRepository } from '../../ports/doctor-profile.repository';
import { SPECIALTY_REPOSITORY, type SpecialtyRepository } from '../../ports/specialty.repository';
import { DoctorStatusService } from '../../doctor-status.service';
import { requireAdmin } from './doctor-review.use-cases';

export interface AdminDoctorItem extends DoctorStatus {
  doctorProfileId: string;
  firstName: string;
  lastName: string;
  specialty: { id: string; code: string; name: string; isActive: boolean } | null;
}

// B6 (plan v2 §12): lista de médicos para el admin con su estado derivado. Sin directorio público (D-36). El estado no
// se persiste (N3): se deriva por médico y se filtra en la aplicación. Suficiente con pocos médicos; con volumen, el
// repositorio expondrá la misma regla en SQL con una prueba de paridad (diseño v3 §D.6).
@Injectable()
export class ListDoctorsUseCase {
  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY) private readonly profiles: DoctorProfileRepository,
    @Inject(DOCTOR_IDENTITY_GATEWAY) private readonly identity: DoctorIdentityGateway,
    @Inject(SPECIALTY_REPOSITORY) private readonly specialties: SpecialtyRepository,
    private readonly statusService: DoctorStatusService,
  ) {}

  async execute(actor: Actor, query: { status?: DoctorGlobalStatus; page: number; pageSize: number }): Promise<{ items: AdminDoctorItem[]; total: number }> {
    requireAdmin(actor);
    const catalog = new Map((await this.specialties.listAll()).map((s) => [s.id, s]));
    const items: AdminDoctorItem[] = [];
    for (const profile of await this.profiles.listAll()) {
      const legal = await this.identity.findLegalIdentity(profile.userProfileId);
      if (!legal) continue;
      const { status } = await this.statusService.read(profile);
      if (query.status && status.status !== query.status) continue;
      const s = catalog.get(profile.specialtyId);
      items.push({
        doctorProfileId: profile.id, firstName: legal.firstName, lastName: legal.lastName,
        specialty: s ? { id: s.id, code: s.code, name: s.name, isActive: s.isActive } : null, ...status,
      });
    }
    const start = (query.page - 1) * query.pageSize;
    return { items: items.slice(start, start + query.pageSize), total: items.length };
  }
}

// Detalle del médico para el admin: datos legales vigentes, estado y el historial de ambas líneas (sin claves).
@Injectable()
export class GetDoctorDetailUseCase {
  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY) private readonly profiles: DoctorProfileRepository,
    @Inject(DOCTOR_IDENTITY_GATEWAY) private readonly identity: DoctorIdentityGateway,
    @Inject(SPECIALTY_REPOSITORY) private readonly specialties: SpecialtyRepository,
    private readonly statusService: DoctorStatusService,
  ) {}

  async execute(actor: Actor, doctorProfileId: string) {
    requireAdmin(actor);
    const profile = await this.profiles.findById(doctorProfileId);
    if (!profile) throw new DoctorNotFoundError();
    const legal = await this.identity.findLegalIdentity(profile.userProfileId);
    if (!legal) throw new DoctorNotFoundError();
    const { status, identityReviews, licenseReviews } = await this.statusService.read(profile);
    const specialty = await this.specialties.findById(profile.specialtyId);
    const item = (r: { id: string; attempt: number; revision: number; status: string; createdAt: Date; reviewedAt: Date | null; rejectionReason: string | null }) => ({
      id: r.id, attempt: r.attempt, revision: r.revision, status: r.status, submittedAt: r.createdAt, reviewedAt: r.reviewedAt, rejectionReason: r.rejectionReason,
    });
    return {
      doctorProfileId: profile.id,
      firstName: legal.firstName,
      lastName: legal.lastName,
      curp: legal.curp,
      phone: legal.phone,
      licenseNumber: profile.licenseNumber,
      specialty: specialty ? { id: specialty.id, code: specialty.code, name: specialty.name, isActive: specialty.isActive } : null,
      identityRevision: profile.identityRevision,
      professionalRevision: profile.professionalRevision,
      ...status,
      history: {
        identity: identityReviews.map(item),
        license: licenseReviews.map((r) => ({ ...item(r), reason: r.reason, licenseNumber: r.licenseNumber })),
      },
    };
  }
}

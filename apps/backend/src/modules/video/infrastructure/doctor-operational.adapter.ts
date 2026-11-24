import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DoctorOperationalPolicy } from '../../doctors/application/policies/doctor-operational.policy';
import { isOperational } from '../../doctors/domain/doctor-status';
import type { DoctorOperationalCheck, IdGenerator } from '../application/ports/video.ports';

// RN-140 / D-38: la habilitación del médico la decide M03 (DoctorOperationalPolicy); videoconsulta no la reimplementa.
@Injectable()
export class PolicyDoctorOperationalCheck implements DoctorOperationalCheck {
  constructor(private readonly policy: DoctorOperationalPolicy) {}

  assertCanOperate(doctorProfileId: string): Promise<void> {
    return this.policy.assertCanOperate(doctorProfileId);
  }

  async canOperate(doctorProfileId: string): Promise<boolean> {
    return isOperational(await this.policy.statusOf(doctorProfileId));
  }
}

@Injectable()
export class RandomUuidGenerator implements IdGenerator {
  newId(): string {
    return randomUUID();
  }
}

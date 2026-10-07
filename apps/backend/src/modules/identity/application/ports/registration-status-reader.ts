import type { RegistrationSnapshot } from '../../domain/registration-status';

// Lee, en una sola consulta y sin caché, los datos de los que se deriva el estado del registro (DP-8).
export interface RegistrationStatusReader {
  read(userId: string): Promise<RegistrationSnapshot>;
}

export const REGISTRATION_STATUS_READER = Symbol('REGISTRATION_STATUS_READER');

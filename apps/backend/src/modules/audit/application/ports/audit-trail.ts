import type { AuditEvent } from '../../domain/audit-event';

// Registro de auditoría transversal de PEI (RF-52, RN-119). Solo permite agregar eventos.
//
// Contrato (D1, D6): record() se llama dentro de la UnitOfWork del caso de uso. El evento se confirma
// o se revierte junto con la operación; fuera de una UnitOfWork falla con AuditOutsideTransactionError.
export interface AuditTrail {
  record(event: AuditEvent): Promise<void>;
}

export const AUDIT_TRAIL = Symbol('AUDIT_TRAIL');

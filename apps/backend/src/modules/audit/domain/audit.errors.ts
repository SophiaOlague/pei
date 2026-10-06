// Errores de programación del módulo de auditoría: los provoca el código que arma o registra
// el evento, no los datos del cliente. Por eso no son DomainError: el filtro HTTP los trata
// como error interno (500) y no expone su detalle.

export class InvalidAuditEventError extends Error {
  constructor(reason: string) {
    super(`Evento de auditoría inválido: ${reason}`);
    this.name = 'InvalidAuditEventError';
  }
}

export class AuditOutsideTransactionError extends Error {
  constructor() {
    super('AuditTrail.record() debe ejecutarse dentro de una UnitOfWork');
    this.name = 'AuditOutsideTransactionError';
  }
}

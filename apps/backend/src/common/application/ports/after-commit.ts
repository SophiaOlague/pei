// Acciones que solo deben ocurrir si la transacción que las origina se confirma (p. ej., publicar eventos de dominio).
//
// - Dentro de una unidad de trabajo, la acción se guarda y se ejecuta después del COMMIT de la transacción exterior.
//   Si la unidad (o una exterior) termina en rollback, la acción se descarta. Una unidad interior (SAVEPOINT) que
//   falla descarta sus acciones aunque la exterior se confirme.
// - Fuera de una unidad de trabajo no hay nada que esperar: la acción se ejecuta enseguida.
// - Los errores de la acción no afectan a la operación ya confirmada: se registran en el log.
// Es una entrega en memoria, sin durabilidad: si el proceso cae entre el COMMIT y la acción, esta se pierde (un outbox
// persistente sería el paso siguiente, con su propia autorización).

export type AfterCommitAction = () => void | Promise<void>;

export interface AfterCommit {
  afterCommit(action: AfterCommitAction): void;
}

export const AFTER_COMMIT = Symbol('AFTER_COMMIT');

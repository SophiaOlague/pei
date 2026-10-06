// Error de dominio base: el dominio y los casos de uso lanzan subclases de DomainError
// sin saber nada de HTTP. La capa de presentación traduce cada "kind" a un código de estado.

export type DomainErrorKind =
  | 'validation' // datos de entrada inválidos
  | 'unauthenticated' // no hay identidad válida
  | 'forbidden' // la identidad no tiene permiso
  | 'not_found' // el recurso no existe
  | 'conflict' // choca con el estado actual (duplicado, solapamiento, concurrencia)
  | 'business_rule'; // una regla de negocio impide la operación

export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

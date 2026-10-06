import { ValidationPipe } from '@nestjs/common';

// Validación de entrada para todos los DTO (RNF-10, OWASP API3: asignación masiva).
// - whitelist: descarta propiedades sin decoradores de validación.
// - forbidNonWhitelisted: en lugar de descartarlas en silencio, rechaza la petición con 400.
// - transform: entrega al controller una instancia del DTO con los tipos convertidos.
// Los parámetros tipados como objetos literales o primitivos no se validan; solo las clases DTO.
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
}

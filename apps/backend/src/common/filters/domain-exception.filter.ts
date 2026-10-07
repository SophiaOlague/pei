import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { DomainError, type DomainErrorKind } from '../domain/domain-error';
import { translatePostgresError } from '../infrastructure/postgres-error-translator';

// Qué código HTTP corresponde a cada tipo de error de dominio.
const STATUS_BY_KIND: Record<DomainErrorKind, number> = {
  validation: HttpStatus.BAD_REQUEST,
  unauthenticated: HttpStatus.UNAUTHORIZED,
  forbidden: HttpStatus.FORBIDDEN,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  business_rule: HttpStatus.UNPROCESSABLE_ENTITY,
};

@Catch(Error)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: Error, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Un error de PostgreSQL que no pasó por una unidad de trabajo se traduce aquí.
    const domainError = exception instanceof DomainError ? exception : translatePostgresError(exception);

    if (domainError) {
      const status = STATUS_BY_KIND[domainError.kind];
      const details = domainError.details;
      response.status(status).json({
        statusCode: status,
        message: domainError.message,
        error: domainError.name,
        ...(details ? { details } : {}),
      });
      return;
    }

    // HttpException también hereda de Error, así que @Catch(Error) la atrapa antes que el filtro
    // por defecto de Nest: se responde igual que él, conservando su status y su cuerpo.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response
        .status(status)
        .json(typeof body === 'object' ? body : { statusCode: status, message: body });
      return;
    }

    // No es un error de dominio conocido: deja que se comporte como error real de servidor
    console.error(exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Error interno del servidor',
    });
  }
}

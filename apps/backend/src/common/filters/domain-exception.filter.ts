import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import {
  DuplicateCurpError,
  TermsNotAcceptedError,
  ProfileAlreadyCompletedError,
  MissingIdentityDocumentsError,
  LegalDocumentsNotPublishedError,
} from '../../modules/identity/domain/errors/identity.errors';

// Mapa: qué clase de error de dominio corresponde a qué código HTTP.
// Todos estos son errores de "el cliente mandó algo inválido" → 400.
const DOMAIN_ERROR_STATUS = new Map<Function, number>([
  [DuplicateCurpError, HttpStatus.BAD_REQUEST],
  [TermsNotAcceptedError, HttpStatus.BAD_REQUEST],
  [ProfileAlreadyCompletedError, HttpStatus.BAD_REQUEST],
  [MissingIdentityDocumentsError, HttpStatus.BAD_REQUEST],
  [LegalDocumentsNotPublishedError, HttpStatus.CONFLICT], // 409: el sistema no está listo, no es culpa del cliente
]);

@Catch(Error)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: Error, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status = DOMAIN_ERROR_STATUS.get(exception.constructor);

    if (status) {
      response.status(status).json({
        statusCode: status,
        message: exception.message,
        error: exception.name,
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
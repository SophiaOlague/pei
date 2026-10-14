import {
  ArgumentsHost,
  BadRequestException,
  CanActivate,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  INestApplication,
  Injectable,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DomainExceptionFilter } from './domain-exception.filter';
import {
  InvalidCurpError,
  LegalDocumentsNotPublishedError,
  ProfileAlreadyExistsError,
  RegistrationDataConflictError,
  RegistrationIncompleteError,
} from '../../modules/identity/domain/identity.errors';
import { InvalidDocumentFileError } from '../../modules/private-storage/domain/private-storage.errors';
import { DomainError, type DomainErrorKind } from '../domain/domain-error';

// ArgumentsHost mínimo: solo lo que usa el filtro (switchToHttp().getResponse()).
function mockHost() {
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
  return { host, response };
}

describe('DomainExceptionFilter', () => {
  const filter = new DomainExceptionFilter();

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('excepciones HTTP de Nest', () => {
    it('UnauthorizedException → 401 con el cuerpo por defecto de Nest', () => {
      const { host, response } = mockHost();

      filter.catch(new UnauthorizedException('Sesión inválida o no proporcionada'), host);

      expect(response.status).toHaveBeenCalledWith(401);
      expect(response.json).toHaveBeenCalledWith({
        statusCode: 401,
        message: 'Sesión inválida o no proporcionada',
        error: 'Unauthorized',
      });
      expect(console.error).not.toHaveBeenCalled();
    });

    it('BadRequestException → 400 con el cuerpo por defecto de Nest', () => {
      const { host, response } = mockHost();

      filter.catch(new BadRequestException('No se recibió ningún archivo'), host);

      expect(response.status).toHaveBeenCalledWith(400);
      expect(response.json).toHaveBeenCalledWith({
        statusCode: 400,
        message: 'No se recibió ningún archivo',
        error: 'Bad Request',
      });
    });

    it('HttpException con cuerpo en texto → { statusCode, message }', () => {
      const { host, response } = mockHost();

      filter.catch(new HttpException('Demasiadas solicitudes', HttpStatus.TOO_MANY_REQUESTS), host);

      expect(response.status).toHaveBeenCalledWith(429);
      expect(response.json).toHaveBeenCalledWith({ statusCode: 429, message: 'Demasiadas solicitudes' });
    });

    it('HttpException con cuerpo personalizado → se conserva tal cual', () => {
      const { host, response } = mockHost();
      const body = { statusCode: 403, message: ['campo inválido'], error: 'Forbidden', code: 'X' };

      filter.catch(new HttpException(body, HttpStatus.FORBIDDEN), host);

      expect(response.status).toHaveBeenCalledWith(403);
      expect(response.json).toHaveBeenCalledWith(body);
    });
  });

  // M02 reemplazó los errores de complete-profile (TermsNotAccepted, ProfileAlreadyCompleted,
  // MissingIdentityDocuments) por los del nuevo flujo; una CURP duplicada es 409 (decisión de la CURP), y desde
  // M03 A3 (D-17) se responde con RegistrationDataConflictError, genérico para cualquier dato duplicado.
  describe('excepciones de dominio de Identity', () => {
    it.each([
      [new RegistrationDataConflictError('curp'), 409],
      [new InvalidCurpError(), 400],
      [new ProfileAlreadyExistsError(), 409],
      [new InvalidDocumentFileError(), 400],
      [new LegalDocumentsNotPublishedError(), 409],
    ])('%p → %i', (error, status) => {
      const { host, response } = mockHost();

      filter.catch(error, host);

      expect(response.status).toHaveBeenCalledWith(status);
      expect(response.json).toHaveBeenCalledWith({ statusCode: status, message: error.message, error: error.name });
    });

    it('[TC-M03-050][D-17] RegistrationDataConflictError: la respuesta es idéntica para cualquier causa y no la revela', () => {
      const bodies = (['curp', 'license_number'] as const).map((field) => {
        const { host, response } = mockHost();
        filter.catch(new RegistrationDataConflictError(field), host);
        expect(response.status).toHaveBeenCalledWith(409);
        return response.json.mock.calls[0][0];
      });
      expect(bodies[0]).toEqual({
        statusCode: 409,
        message: 'No fue posible completar el registro con los datos proporcionados',
        error: 'RegistrationDataConflictError',
      });
      expect(bodies[1]).toEqual(bodies[0]);
      expect(JSON.stringify(bodies)).not.toMatch(/curp|license|field/i);
    });

    it('[TC-M02-090][DP-8] un error con details los incluye en la respuesta', () => {
      const { host, response } = mockHost();

      filter.catch(new RegistrationIncompleteError(['legal', 'identity_review']), host);

      expect(response.status).toHaveBeenCalledWith(403);
      expect(response.json).toHaveBeenCalledWith({
        statusCode: 403,
        message: 'El registro del paciente está incompleto',
        error: 'RegistrationIncompleteError',
        details: { missing: ['legal', 'identity_review'] },
      });
    });
  });

  describe('mapeo por kind de DomainError', () => {
    class SampleError extends DomainError {
      constructor(readonly kind: DomainErrorKind) {
        super(`error de tipo ${kind}`);
      }
    }

    it.each([
      ['validation', 400],
      ['unauthenticated', 401],
      ['forbidden', 403],
      ['not_found', 404],
      ['conflict', 409],
      ['business_rule', 422],
    ] as [DomainErrorKind, number][])('[TC-M00-070][RT-M00-01] kind %s → %i', (kind, status) => {
      const { host, response } = mockHost();

      filter.catch(new SampleError(kind), host);

      expect(response.status).toHaveBeenCalledWith(status);
      expect(response.json).toHaveBeenCalledWith({ statusCode: status, message: `error de tipo ${kind}`, error: 'SampleError' });
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe('errores de PostgreSQL que llegan sin traducir', () => {
    const driverError = (code: string, message: string) =>
      Object.assign(new Error('Failed query: insert into "medication" ...'), {
        cause: Object.assign(new Error(message), { code, severity: 'ERROR', constraint: 'medication_name_unique', table: 'medication' }),
      });

    it('[TC-M00-071][RT-M00-03][RNF-10] 23505 → 409 sin exponer SQL ni el nombre de la constraint', () => {
      const { host, response } = mockHost();

      filter.catch(driverError('23505', 'duplicate key value violates unique constraint "medication_name_unique"'), host);

      expect(response.status).toHaveBeenCalledWith(409);
      const body = response.json.mock.calls[0][0];
      expect(body).toEqual({ statusCode: 409, message: 'El registro ya existe', error: 'UniqueConstraintViolationError' });
      expect(JSON.stringify(body)).not.toMatch(/medication|insert|duplicate key/i);
    });

    it('[TC-M00-072][RT-M00-03] P0001 de un trigger → 422 con el mensaje del trigger', () => {
      const { host, response } = mockHost();

      filter.catch(driverError('P0001', 'La tabla audit_log es de solo inserción: no admite UPDATE'), host);

      expect(response.status).toHaveBeenCalledWith(422);
      expect(response.json).toHaveBeenCalledWith({
        statusCode: 422,
        message: 'La tabla audit_log es de solo inserción: no admite UPDATE',
        error: 'BusinessRuleViolationError',
      });
    });

    it('[TC-M00-073][RNF-10] SQLSTATE sin traducción → 500 genérico, sin el mensaje de PostgreSQL', () => {
      const { host, response } = mockHost();

      filter.catch(driverError('42P01', 'relation "x" does not exist'), host);

      expect(response.status).toHaveBeenCalledWith(500);
      expect(response.json).toHaveBeenCalledWith({ statusCode: 500, message: 'Error interno del servidor' });
    });
  });

  describe('errores inesperados', () => {
    it('Error genérico → 500 sin exponer el mensaje y se registra en consola', () => {
      const { host, response } = mockHost();
      const error = new Error('detalle interno que no debe salir');

      filter.catch(error, host);

      expect(response.status).toHaveBeenCalledWith(500);
      expect(response.json).toHaveBeenCalledWith({ statusCode: 500, message: 'Error interno del servidor' });
      expect(console.error).toHaveBeenCalledWith(error);
    });
  });

  // Mismo registro que main.ts (useGlobalFilters) para comprobar el recorrido real de Nest,
  // incluido un guard que lanza UnauthorizedException como SessionGuard.
  describe('registrado como filtro global', () => {
    @Injectable()
    class RejectGuard implements CanActivate {
      canActivate(): boolean {
        throw new UnauthorizedException('Sesión inválida o no proporcionada');
      }
    }

    @Controller('filter-test')
    class FilterTestController {
      @Get('guarded')
      @UseGuards(RejectGuard)
      guarded() {
        return { ok: true };
      }

      @Get('bad-request')
      badRequest() {
        throw new BadRequestException('Carpeta de destino no válida');
      }

      @Get('domain')
      domain() {
        throw new InvalidCurpError();
      }

      @Get('crash')
      crash() {
        throw new Error('boom');
      }

      @Get('ok')
      ok() {
        return { ok: true };
      }
    }

    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ controllers: [FilterTestController] }).compile();
      app = moduleRef.createNestApplication({ logger: false });
      app.useGlobalFilters(new DomainExceptionFilter());
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('guard que lanza UnauthorizedException → 401', async () => {
      const res = await request(app.getHttpServer()).get('/filter-test/guarded');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ statusCode: 401, message: 'Sesión inválida o no proporcionada', error: 'Unauthorized' });
    });

    it('BadRequestException en el handler → 400', async () => {
      const res = await request(app.getHttpServer()).get('/filter-test/bad-request');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ statusCode: 400, message: 'Carpeta de destino no válida', error: 'Bad Request' });
    });

    it('error de dominio → 400 con su nombre', async () => {
      const res = await request(app.getHttpServer()).get('/filter-test/domain');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        statusCode: 400,
        message: 'La CURP no tiene un formato válido',
        error: 'InvalidCurpError',
      });
    });

    it('Error genérico → 500', async () => {
      const res = await request(app.getHttpServer()).get('/filter-test/crash');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ statusCode: 500, message: 'Error interno del servidor' });
    });

    it('ruta inexistente → 404 (NotFoundException de Nest)', async () => {
      const res = await request(app.getHttpServer()).get('/filter-test/no-existe');
      expect(res.status).toBe(404);
    });

    it('respuesta exitosa sin cambios', async () => {
      const res = await request(app.getHttpServer()).get('/filter-test/ok');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });
});

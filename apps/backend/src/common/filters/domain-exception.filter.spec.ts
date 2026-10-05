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
  DuplicateCurpError,
  LegalDocumentsNotPublishedError,
  MissingIdentityDocumentsError,
  ProfileAlreadyCompletedError,
  TermsNotAcceptedError,
} from '../../modules/identity/domain/errors/identity.errors';

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

  describe('excepciones de dominio (comportamiento existente)', () => {
    it.each([
      [new DuplicateCurpError('PRUE900101HDFRRS03'), 400],
      [new TermsNotAcceptedError(), 400],
      [new ProfileAlreadyCompletedError(), 400],
      [new MissingIdentityDocumentsError(), 400],
      [new LegalDocumentsNotPublishedError(), 409],
    ])('%s → %i', (error, status) => {
      const { host, response } = mockHost();

      filter.catch(error, host);

      expect(response.status).toHaveBeenCalledWith(status);
      expect(response.json).toHaveBeenCalledWith({ statusCode: status, message: error.message, error: error.name });
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
        throw new ProfileAlreadyCompletedError();
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
        message: 'El perfil de este usuario ya fue completado',
        error: 'ProfileAlreadyCompletedError',
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

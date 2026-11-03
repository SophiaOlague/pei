import { Controller, Get, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { corsOptionsFor } from '../src/common/http/cors';

// CORS por HTTP con la misma configuración que src/main.ts (corsOptionsFor). Sin BD.
@Controller('cors-probe')
class CorsProbeController {
  @Get()
  read() {
    return { ok: true };
  }

  @Post()
  write() {
    return { ok: true };
  }
}

describe('CORS con credenciales por HTTP', () => {
  let app: INestApplication;
  const ALLOWED = 'http://localhost:3001';
  const FOREIGN = 'https://sitio-ajeno.example';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [CorsProbeController] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.enableCors(corsOptionsFor(['http://localhost:3000', 'gestinovo://', ALLOWED]));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('[TC-M00-247] un origen permitido recibe su propio origen y credenciales', async () => {
    const res = await http().get('/cors-probe').set('Origin', ALLOWED);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    const preflight = await http()
      .options('/cors-probe')
      .set('Origin', ALLOWED)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(ALLOWED);
  });

  it('[TC-M00-248] un origen no autorizado no recibe Access-Control-Allow-Origin (ni reflejo ni «*»)', async () => {
    const res = await http().get('/cors-probe').set('Origin', FOREIGN);
    // Sin Access-Control-Allow-Origin el navegador no entrega la respuesta (la librería cors envía
    // Access-Control-Allow-Credentials en todas las respuestas; por sí sola no autoriza nada).
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    const preflight = await http()
      .options('/cors-probe')
      .set('Origin', FOREIGN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('[TC-M00-249] el esquema de la app móvil no se acepta como origen web', async () => {
    const res = await http().get('/cors-probe').set('Origin', 'gestinovo://');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

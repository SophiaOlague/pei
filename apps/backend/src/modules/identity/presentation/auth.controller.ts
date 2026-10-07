import { All, Controller, Inject, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { AUTH_INSTANCE, CLIENT_IP_HEADER, type Auth } from '../../../auth/auth.config';
import { extractRequestMetadata } from '../../../auth/authenticated-request';

// Rutas de Better Auth (/api/auth/*): registro, inicio de sesión, verificación de correo y recuperación.
// La IP del cliente sale de request.ip (respeta "trust proxy" de Express, deuda M00 #3) y se pasa a Better
// Auth en un encabezado propio que reemplaza cualquier valor enviado por el cliente: así el rate limit no
// depende de X-Forwarded-For falsificable.
@Controller('api/auth')
export class AuthController {
  private readonly handler: ReturnType<typeof toNodeHandler>;

  constructor(@Inject(AUTH_INSTANCE) auth: Auth) {
    this.handler = toNodeHandler(auth);
  }

  @All('*path')
  async handleAuth(@Req() req: Request, @Res() res: Response) {
    delete req.headers[CLIENT_IP_HEADER];
    const { ipAddress } = extractRequestMetadata(req);
    if (ipAddress) req.headers[CLIENT_IP_HEADER] = ipAddress;
    return this.handler(req, res);
  }
}

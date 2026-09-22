import { All, Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { auth } from '../../auth/auth.config';
import { toNodeHandler } from 'better-auth/node';
import { SessionGuard } from '../../auth/session.guard';

@Controller('api/auth')
export class IdentityController {
  private handler = toNodeHandler(auth);

  @All('*path')
  async handleAuth(@Req() req: Request, @Res() res: Response) {
    return this.handler(req, res);
  }

}
//PRUEBA DE SESIÓN
@Controller('me')
export class MeController {
  @Get()
  @UseGuards(SessionGuard)
  getMe(@Req() req: Request & { session?: any }) {
    return {
      message: 'Sesión válida',
      user: req.session.user,
    };
  }
}
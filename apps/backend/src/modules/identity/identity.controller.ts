import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { auth } from '../../auth/auth.config';
import { toNodeHandler } from 'better-auth/node';

@Controller('api/auth')
export class IdentityController {
  private handler = toNodeHandler(auth);

  @All('*path')
  async handleAuth(@Req() req: Request, @Res() res: Response) {
    return this.handler(req, res);
  }
}
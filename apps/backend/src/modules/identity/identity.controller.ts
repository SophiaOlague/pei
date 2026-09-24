import { All, Body, Controller, Get, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { auth } from '../../auth/auth.config';
import { toNodeHandler } from 'better-auth/node';
import { SessionGuard } from '../../auth/session.guard';
import { CompleteProfileUseCase } from './application/use-cases/complete-profile.use-case';
import { UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FILE_STORAGE } from './domain/ports/file-storage';
import type { FileStorage } from './domain/ports/file-storage';

@Controller('api/auth')
export class IdentityController {
  private handler = toNodeHandler(auth);

  @All('*path')
  async handleAuth(@Req() req: Request, @Res() res: Response) {
    return this.handler(req, res);
  }
}

@Controller('me')
export class MeController {
  constructor(private readonly completeProfileUseCase: CompleteProfileUseCase,
               @Inject(FILE_STORAGE) private readonly fileStorage: FileStorage,
  ) {}

  @Get()
  @UseGuards(SessionGuard)
  getMe(@Req() req: Request & { session?: any }) {
    return {
      message: 'Sesión válida',
      user: req.session.user,
    };
  }

  @Post('complete-profile')
  @UseGuards(SessionGuard)
  async completeProfile(
    @Req() req: Request & { session?: any },
    @Body() body: {
      firstName: string;
      lastName: string;
      curp: string;
      phone?: string;
      birthDate?: string;
      photoUrl?: string;
      ineFrontUrl: string;
      ineBackUrl: string;
      acceptedTerms: boolean;
    },
  ) {
  const profile = await this.completeProfileUseCase.execute({
    userId: req.session.user.id,
    ...body,
  });
  return { message: 'Perfil completado exitosamente', profile };
}

   @Post('upload')
  @UseGuards(SessionGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder: string,
  ) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    const allowedFolders = ['patient-photos', 'patient-ine'];
    if (!allowedFolders.includes(folder)) {
      throw new BadRequestException('Carpeta de destino no válida');
    }

    const url = await this.fileStorage.upload(file.buffer, folder, file.mimetype);
    return { url };
  }

}
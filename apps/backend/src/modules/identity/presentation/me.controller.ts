import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { SessionGuard } from '../../../auth/session.guard';
import { RolesGuard } from '../../../auth/roles.guard';
import { Roles } from '../../../auth/roles.decorator';
import { CurrentActor } from '../../../auth/current-actor.decorator';
import { CurrentSession } from '../../../auth/current-session.decorator';
import type { AuthSession } from '../../../auth/ports/session-provider';
import type { Actor } from '../../../common/application/actor';
import { RegisterPatientProfileUseCase } from '../application/use-cases/register-patient-profile.use-case';
import { AcceptLegalDocumentsUseCase } from '../application/use-cases/legal-documents.use-cases';
import { SubmitIdentityVerificationUseCase } from '../application/use-cases/submit-identity-verification.use-case';
import { GetRegistrationStatusUseCase } from '../application/use-cases/registration-status.use-cases';
import {
  GetMyIdentityVerificationUseCase,
  GetPatientProfileUseCase,
  OpenProfilePhotoUseCase,
  UpdatePatientProfileUseCase,
  UpdateProfilePhotoUseCase,
} from '../application/use-cases/patient-profile.use-cases';
import { AcceptLegalDocumentsDto, RegisterPatientProfileDto, UpdatePatientProfileDto } from './dto/identity.dto';
import { RateLimit, RateLimitGuard } from './rate-limit.guard';
import { IdentityDocumentsUpload, ProfilePhotoUpload } from './uploads';
import { privateImageResponse } from '../../private-storage/presentation/private-file-response';

// Rutas de la cuenta autenticada. /me/complete-profile y /me/upload ya no existen (DT-13).
@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  constructor(
    private readonly registerProfile: RegisterPatientProfileUseCase,
    private readonly registrationStatus: GetRegistrationStatusUseCase,
    private readonly getProfile: GetPatientProfileUseCase,
    private readonly updateProfile: UpdatePatientProfileUseCase,
    private readonly updatePhoto: UpdateProfilePhotoUseCase,
    private readonly openPhoto: OpenProfilePhotoUseCase,
    private readonly acceptLegal: AcceptLegalDocumentsUseCase,
    private readonly submitVerification: SubmitIdentityVerificationUseCase,
    private readonly myVerification: GetMyIdentityVerificationUseCase,
  ) {}

  // RF-02: cuenta, rol, perfil y estado del registro (solo para pacientes o cuentas sin perfil).
  @Get()
  async me(@CurrentActor() actor: Actor, @CurrentSession() session: AuthSession) {
    return {
      user: { id: session.user.id, email: session.user.email },
      role: actor.role,
      profile: actor.role === 'patient' ? await this.getProfile.execute(actor) : null,
      registrationStatus: await this.registrationStatus.executeIfPatient(actor),
    };
  }

  @Get('registration-status')
  status(@CurrentActor() actor: Actor) {
    return this.registrationStatus.execute(actor);
  }

  // Sesión sin perfil (aún no hay rol). El rol 'patient' lo fija el caso de uso.
  @Post('patient-profile')
  createPatientProfile(@CurrentActor() actor: Actor, @Body() body: RegisterPatientProfileDto) {
    return this.registerProfile.execute(actor, body);
  }

  @Get('profile')
  @UseGuards(RolesGuard)
  @Roles('patient')
  profile(@CurrentActor() actor: Actor) {
    return this.getProfile.execute(actor);
  }

  @Patch('profile')
  @UseGuards(RolesGuard)
  @Roles('patient')
  patchProfile(@CurrentActor() actor: Actor, @Body() body: UpdatePatientProfileDto) {
    return this.updateProfile.execute(actor, body);
  }

  @Put('profile/photo')
  @UseGuards(RolesGuard, RateLimitGuard)
  @Roles('patient')
  @RateLimit('profile_photo_upload')
  @UseInterceptors(ProfilePhotoUpload())
  putPhoto(@CurrentActor() actor: Actor, @UploadedFile() photo?: Express.Multer.File) {
    return this.updatePhoto.execute(actor, photo?.buffer);
  }

  @Get('profile/photo')
  @UseGuards(RolesGuard)
  @Roles('patient')
  async photo(@CurrentActor() actor: Actor, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    return privateImageResponse(res, await this.openPhoto.execute(actor));
  }

  @Post('legal-acceptances')
  @UseGuards(RolesGuard)
  @Roles('patient')
  accept(@CurrentActor() actor: Actor, @Body() body: AcceptLegalDocumentsDto) {
    return this.acceptLegal.execute(actor, body.documentIds);
  }

  @Post('identity-verification')
  @HttpCode(201)
  @UseGuards(RolesGuard, RateLimitGuard)
  @Roles('patient')
  @RateLimit('identity_verification_upload')
  @UseInterceptors(IdentityDocumentsUpload())
  submit(
    @CurrentActor() actor: Actor,
    @UploadedFiles() files: { front?: Express.Multer.File[]; back?: Express.Multer.File[] } = {},
  ) {
    return this.submitVerification.execute(actor, { front: files.front?.[0]?.buffer, back: files.back?.[0]?.buffer });
  }

  @Get('identity-verification')
  @UseGuards(RolesGuard)
  @Roles('patient')
  verification(@CurrentActor() actor: Actor) {
    return this.myVerification.execute(actor);
  }
}

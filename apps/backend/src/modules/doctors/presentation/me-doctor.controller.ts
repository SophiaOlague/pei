import {
  Body, Controller, Get, HttpCode, Patch, Post, Put, Res, StreamableFile, UploadedFile, UploadedFiles, UseGuards, UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { SessionGuard } from '../../../auth/session.guard';
import { RolesGuard } from '../../../auth/roles.guard';
import { Roles } from '../../../auth/roles.decorator';
import { CurrentActor } from '../../../auth/current-actor.decorator';
import type { Actor } from '../../../common/application/actor';
import { privateImageResponse, privatePdfResponse } from '../../private-storage/presentation/private-file-response';
import { RegisterDoctorProfileUseCase } from '../application/use-cases/register-doctor-profile.use-case';
import { GetDoctorProfileUseCase, OpenDoctorPhotoUseCase, UpdateDoctorPhotoUseCase, UpdateDoctorProfileUseCase } from '../application/use-cases/doctor-profile.use-cases';
import { ChangeDoctorSpecialtyUseCase } from '../application/use-cases/doctor-changes.use-cases';
import { SubmitDoctorIdentityVerificationUseCase, SubmitDoctorLicenseVerificationUseCase } from '../application/use-cases/doctor-submissions.use-cases';
import { GetDoctorStatusUseCase, GetDoctorVerificationHistoryUseCase, OpenOwnLicenseDocumentUseCase } from '../application/use-cases/doctor-status.use-cases';
import {
  ChangeDoctorSpecialtyDto, RegisterDoctorProfileDto, SubmitLicenseVerificationDto, UpdateDoctorProfileDto,
} from './dto/doctor.dto';
import { DoctorRateLimit, DoctorRateLimitGuard } from './rate-limit';
import { DoctorIdentityDocumentsUpload, DoctorLicenseUpload, DoctorPhotoUpload } from './uploads';

// M03 B5 (plan v2 §12): rutas del propio médico. El médico nunca envía un doctorProfileId: sale de la sesión. Ninguna
// respuesta incluye claves de objetos ni URLs. RN-138 (C-16): no hay ruta para que el médico cambie su CURP ni su
// nombre legal; se capturan solo al registrarse.
@Controller('me')
@UseGuards(SessionGuard)
export class MeDoctorController {
  constructor(
    private readonly register: RegisterDoctorProfileUseCase,
    private readonly getProfile: GetDoctorProfileUseCase,
    private readonly updateProfile: UpdateDoctorProfileUseCase,
    private readonly updatePhoto: UpdateDoctorPhotoUseCase,
    private readonly openPhoto: OpenDoctorPhotoUseCase,
    private readonly changeSpecialty: ChangeDoctorSpecialtyUseCase,
    private readonly submitIdentity: SubmitDoctorIdentityVerificationUseCase,
    private readonly submitLicense: SubmitDoctorLicenseVerificationUseCase,
    private readonly getStatus: GetDoctorStatusUseCase,
    private readonly getHistory: GetDoctorVerificationHistoryUseCase,
    private readonly openLicense: OpenOwnLicenseDocumentUseCase,
  ) {}

  // Solo una cuenta sin perfil (el caso de uso responde 409 si ya tiene uno).
  @Post('doctor-profile')
  create(@CurrentActor() actor: Actor, @Body() body: RegisterDoctorProfileDto) {
    return this.register.execute(actor, body);
  }

  @Get('doctor-profile')
  @UseGuards(RolesGuard)
  @Roles('doctor')
  profile(@CurrentActor() actor: Actor) {
    return this.getProfile.execute(actor);
  }

  @Patch('doctor-profile')
  @HttpCode(204)
  @UseGuards(RolesGuard)
  @Roles('doctor')
  patch(@CurrentActor() actor: Actor, @Body() body: UpdateDoctorProfileDto) {
    return this.updateProfile.execute(actor, body);
  }

  @Put('doctor-profile/specialty')
  @UseGuards(RolesGuard)
  @Roles('doctor')
  specialty(@CurrentActor() actor: Actor, @Body() body: ChangeDoctorSpecialtyDto) {
    return this.changeSpecialty.execute(actor, body.specialtyId);
  }

  @Put('doctor-profile/photo')
  @HttpCode(204)
  @UseGuards(RolesGuard, DoctorRateLimitGuard)
  @Roles('doctor')
  @DoctorRateLimit('doctor_photo_upload')
  @UseInterceptors(DoctorPhotoUpload())
  putPhoto(@CurrentActor() actor: Actor, @UploadedFile() photo?: Express.Multer.File) {
    return this.updatePhoto.execute(actor, photo?.buffer);
  }

  @Get('doctor-profile/photo')
  @UseGuards(RolesGuard)
  @Roles('doctor')
  async photo(@CurrentActor() actor: Actor, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    return privateImageResponse(res, await this.openPhoto.execute(actor));
  }

  @Get('doctor/status')
  @UseGuards(RolesGuard)
  @Roles('doctor')
  status(@CurrentActor() actor: Actor) {
    return this.getStatus.execute(actor);
  }

  @Get('doctor/verification-history')
  @UseGuards(RolesGuard)
  @Roles('doctor')
  history(@CurrentActor() actor: Actor) {
    return this.getHistory.execute(actor);
  }

  @Post('doctor/identity-verifications')
  @HttpCode(201)
  @UseGuards(RolesGuard, DoctorRateLimitGuard)
  @Roles('doctor')
  @DoctorRateLimit('doctor_identity_upload')
  @UseInterceptors(DoctorIdentityDocumentsUpload())
  submitIne(@CurrentActor() actor: Actor, @UploadedFiles() files: { front?: Express.Multer.File[]; back?: Express.Multer.File[] } = {}) {
    return this.submitIdentity.execute(actor, { front: files.front?.[0]?.buffer, back: files.back?.[0]?.buffer });
  }

  @Post('doctor/license-verifications')
  @HttpCode(201)
  @UseGuards(RolesGuard, DoctorRateLimitGuard)
  @Roles('doctor')
  @DoctorRateLimit('doctor_license_upload')
  @UseInterceptors(DoctorLicenseUpload())
  submitCedula(@CurrentActor() actor: Actor, @Body() body: SubmitLicenseVerificationDto, @UploadedFile() document?: Express.Multer.File) {
    return this.submitLicense.execute(actor, { licenseNumber: body.licenseNumber, document: document?.buffer });
  }

  // H.3: PDF como attachment con CSP sandbox; imagen en línea. Siempre no-store y nosniff.
  @Get('doctor/license-document')
  @UseGuards(RolesGuard)
  @Roles('doctor')
  async license(@CurrentActor() actor: Actor, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const file = await this.openLicense.execute(actor);
    return file.contentType === 'application/pdf' ? privatePdfResponse(res, file) : privateImageResponse(res, file);
  }
}

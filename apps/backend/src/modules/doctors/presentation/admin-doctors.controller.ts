import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { SessionGuard } from '../../../auth/session.guard';
import { RolesGuard } from '../../../auth/roles.guard';
import { Roles } from '../../../auth/roles.decorator';
import { CurrentActor } from '../../../auth/current-actor.decorator';
import type { Actor } from '../../../common/application/actor';
import { privateImageResponse, privatePdfResponse } from '../../private-storage/presentation/private-file-response';
import { GetDoctorDetailUseCase, ListDoctorsUseCase } from '../application/use-cases/admin/doctor-admin.use-cases';
import {
  GetDoctorReviewDetailUseCase, ListPendingDoctorReviewsUseCase, OpenDoctorReviewDocumentUseCase, ReviewDoctorVerificationUseCase,
} from '../application/use-cases/admin/doctor-review.use-cases';
import { DoctorIdentityDocumentParamsDto, ListDoctorsQueryDto, PageQueryDto, RejectDoctorReviewDto } from './dto/admin-doctor.dto';

// M03 B6 (plan v2 §12; RF-06, D-22, D-27): revisión del administrador. Solo admin. Documentos transmitidos por el backend
// con no-store; cada lectura se audita. Ninguna respuesta incluye claves de objetos ni URLs.

@Controller('admin/doctors')
@UseGuards(SessionGuard, RolesGuard)
@Roles('admin')
export class AdminDoctorsController {
  constructor(private readonly list: ListDoctorsUseCase, private readonly detail: GetDoctorDetailUseCase) {}

  @Get()
  index(@CurrentActor() actor: Actor, @Query() query: ListDoctorsQueryDto) {
    return this.list.execute(actor, query);
  }

  @Get(':id')
  show(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.detail.execute(actor, id);
  }
}

@Controller('admin/doctor-identity-verifications')
@UseGuards(SessionGuard, RolesGuard)
@Roles('admin')
export class AdminDoctorIdentityVerificationsController {
  constructor(
    private readonly queue: ListPendingDoctorReviewsUseCase,
    private readonly detail: GetDoctorReviewDetailUseCase,
    private readonly documents: OpenDoctorReviewDocumentUseCase,
    private readonly review: ReviewDoctorVerificationUseCase,
  ) {}

  @Get()
  list(@CurrentActor() actor: Actor, @Query() query: PageQueryDto) {
    return this.queue.execute(actor, 'identity', query.page, query.pageSize);
  }

  @Get(':id')
  show(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.detail.identityDetail(actor, id);
  }

  @Get(':id/documents/:side')
  async document(@CurrentActor() actor: Actor, @Param() params: DoctorIdentityDocumentParamsDto, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    return privateImageResponse(res, await this.documents.identity(actor, params.id, params.side));
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.review.execute(actor, 'identity', id, { decision: 'approve' });
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: RejectDoctorReviewDto) {
    return this.review.execute(actor, 'identity', id, { decision: 'reject', reason: body.reason });
  }
}

@Controller('admin/doctor-license-verifications')
@UseGuards(SessionGuard, RolesGuard)
@Roles('admin')
export class AdminDoctorLicenseVerificationsController {
  constructor(
    private readonly queue: ListPendingDoctorReviewsUseCase,
    private readonly detail: GetDoctorReviewDetailUseCase,
    private readonly documents: OpenDoctorReviewDocumentUseCase,
    private readonly review: ReviewDoctorVerificationUseCase,
  ) {}

  @Get()
  list(@CurrentActor() actor: Actor, @Query() query: PageQueryDto) {
    return this.queue.execute(actor, 'license', query.page, query.pageSize);
  }

  @Get(':id')
  show(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.detail.licenseDetail(actor, id);
  }

  // H.3: PDF como attachment con CSP sandbox; imagen en línea.
  @Get(':id/document')
  async document(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const file = await this.documents.license(actor, id);
    return file.contentType === 'application/pdf' ? privatePdfResponse(res, file) : privateImageResponse(res, file);
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.review.execute(actor, 'license', id, { decision: 'approve' });
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: RejectDoctorReviewDto) {
    return this.review.execute(actor, 'license', id, { decision: 'reject', reason: body.reason });
  }
}

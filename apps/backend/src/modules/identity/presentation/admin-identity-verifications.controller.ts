import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { SessionGuard } from '../../../auth/session.guard';
import { RolesGuard } from '../../../auth/roles.guard';
import { Roles } from '../../../auth/roles.decorator';
import { CurrentActor } from '../../../auth/current-actor.decorator';
import type { Actor } from '../../../common/application/actor';
import {
  GetIdentityVerificationDetailUseCase,
  ListPendingIdentityVerificationsUseCase,
  OpenIdentityDocumentUseCase,
  ReviewIdentityVerificationUseCase,
} from '../application/use-cases/identity-verification-admin.use-cases';
import {
  IdentityDocumentParamsDto,
  ListPendingIdentityVerificationsQueryDto,
  RejectIdentityVerificationDto,
} from './dto/identity.dto';
import { privateImageResponse } from '../../private-storage/presentation/private-file-response';

// RF-07, DP-15: revisión del INE por el administrador. Ninguna respuesta incluye claves de objetos ni URLs.
@Controller('admin/identity-verifications')
@UseGuards(SessionGuard, RolesGuard)
@Roles('admin')
export class AdminIdentityVerificationsController {
  constructor(
    private readonly listPending: ListPendingIdentityVerificationsUseCase,
    private readonly getDetail: GetIdentityVerificationDetailUseCase,
    private readonly openDocument: OpenIdentityDocumentUseCase,
    private readonly review: ReviewIdentityVerificationUseCase,
  ) {}

  @Get()
  list(@CurrentActor() actor: Actor, @Query() query: ListPendingIdentityVerificationsQueryDto) {
    return this.listPending.execute(actor, query.page, query.pageSize);
  }

  @Get(':id')
  detail(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.getDetail.execute(actor, id);
  }

  // Transmitido por el backend con no-store; cada lectura registra identity.identity_document.viewed.
  @Get(':id/documents/:side')
  async document(
    @CurrentActor() actor: Actor,
    @Param() params: IdentityDocumentParamsDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return privateImageResponse(res, await this.openDocument.execute(actor, params.id, params.side));
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.review.execute(actor, id, { decision: 'approve' });
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: RejectIdentityVerificationDto) {
    return this.review.execute(actor, id, { decision: 'reject', reason: body.reason });
  }
}

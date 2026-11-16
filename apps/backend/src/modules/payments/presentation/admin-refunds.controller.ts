import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../../auth/session.guard';
import { RolesGuard } from '../../../auth/roles.guard';
import { Roles } from '../../../auth/roles.decorator';
import { CurrentActor } from '../../../auth/current-actor.decorator';
import type { Actor } from '../../../common/application/actor';
import { fromDecimalString } from '../domain/money';
import { InvalidRefundRequestError } from '../application/refunds.errors';
import { AdminRefundsService } from '../application/use-cases/admin-refunds.service';
import { RejectAdminRefundDto, RequestAdminRefundDto } from './dto/admin-refund.dto';

// H-7: rutas administrativas de reembolsos (RF-46, PAY-17) sobre los casos de uso existentes. Solo el rol admin, como
// las demás rutas /admin. El administrador que actúa sale de la sesión.
//   POST /admin/payments/:paymentId/refunds        solicitar (total o parcial); Idempotency-Key obligatoria
//   GET  /admin/payments/:paymentId/refunds        reembolsos del pago y su conciliación
//   POST /admin/refunds/:refundId/approve          aprobar un parcial pendiente
//   POST /admin/refunds/:refundId/reject           rechazar un parcial pendiente (con motivo)
// Errores de dominio → HTTP (DomainExceptionFilter): 400 validación, 404 inexistente, 422 regla (estado no
// reembolsable, importe por encima del disponible, aprobación no admitida), 409 clave reutilizada con otro contenido.
@Controller('admin')
@UseGuards(SessionGuard, RolesGuard)
@Roles('admin')
export class AdminRefundsController {
  constructor(private readonly refunds: AdminRefundsService) {}

  @Post('payments/:paymentId/refunds')
  @HttpCode(200)
  request(
    @CurrentActor() actor: Actor,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: RequestAdminRefundDto,
  ) {
    if (body.kind === 'full' && body.amount !== undefined) throw new InvalidRefundRequestError('un reembolso total no lleva importe');
    const amount = body.kind === 'full' ? ({ kind: 'full' } as const) : ({ kind: 'partial', amount: fromDecimalString(body.amount!) } as const);
    return this.refunds.request(actor, { paymentId, idempotencyKey: idempotencyKey ?? '', amount, reason: body.reason, notes: body.notes ?? null });
  }

  @Get('payments/:paymentId/refunds')
  forPayment(@Param('paymentId', ParseUUIDPipe) paymentId: string) {
    return this.refunds.forPayment(paymentId);
  }

  @Post('refunds/:refundId/approve')
  @HttpCode(200)
  approve(@CurrentActor() actor: Actor, @Param('refundId', ParseUUIDPipe) refundId: string) {
    return this.refunds.approve(actor, refundId);
  }

  @Post('refunds/:refundId/reject')
  @HttpCode(200)
  reject(@CurrentActor() actor: Actor, @Param('refundId', ParseUUIDPipe) refundId: string, @Body() body: RejectAdminRefundDto) {
    return this.refunds.reject(actor, refundId, body.reason);
  }
}

import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../../auth/session.guard';
import { RolesGuard } from '../../../auth/roles.guard';
import { Roles } from '../../../auth/roles.decorator';
import { CurrentActor } from '../../../auth/current-actor.decorator';
import type { Actor } from '../../../common/application/actor';
import {
  DoctorAppointmentsQuery, GetDoctorSlotsForPatientUseCase, HoldSlotUseCase, ListBookableDoctorsUseCase, PatientAppointmentsQuery, ReleaseHoldUseCase,
} from '../application/use-cases/booking.use-cases';
import { CancelByDoctorUseCase, CancelByPatientUseCase } from '../application/use-cases/cancellation.use-cases';
import { CancellationPolicyService, ConsultationPriceService } from '../application/use-cases/configuration.use-cases';
import { RescheduleByPatientUseCase } from '../application/use-cases/reschedule.use-cases';
import {
  BookableDoctorsQueryDto, DoctorAppointmentsQueryDto, DoctorCancelDto, HoldSlotDto, PatientCancelDto, PublishPolicyDto, PublishPriceDto, RescheduleDto,
  SlotsQueryDto,
} from './dto/appointments.dto';

// M08 (RF-12, RF-14, RF-15, RF-16, RF-66 propuesto). El perfil del actor sale siempre de la sesión. Ninguna ruta
// confirma citas: la confirmación solo entra por AppointmentConfirmationService desde el módulo de pagos (AP-16).

@Controller('doctors')
@UseGuards(SessionGuard, RolesGuard)
@Roles('patient')
export class BookableDoctorsController {
  constructor(
    private readonly list: ListBookableDoctorsUseCase,
    private readonly slots: GetDoctorSlotsForPatientUseCase,
  ) {}

  @Get('bookable')
  bookable(@CurrentActor() actor: Actor, @Query() query: BookableDoctorsQueryDto) {
    return this.list.execute(actor, query.specialtyId);
  }

  @Get(':doctorProfileId/slots')
  doctorSlots(@CurrentActor() actor: Actor, @Param('doctorProfileId', ParseUUIDPipe) id: string, @Query() query: SlotsQueryDto) {
    return this.slots.execute(actor, id, query.from, query.to);
  }
}

@Controller('me/patient/appointments')
@UseGuards(SessionGuard, RolesGuard)
@Roles('patient')
export class PatientAppointmentsController {
  constructor(
    private readonly hold: HoldSlotUseCase,
    private readonly release: ReleaseHoldUseCase,
    private readonly query: PatientAppointmentsQuery,
    private readonly cancel: CancelByPatientUseCase,
    private readonly reschedule: RescheduleByPatientUseCase,
  ) {}

  @Post()
  create(@CurrentActor() actor: Actor, @Body() body: HoldSlotDto) {
    return this.hold.execute(actor, { doctorProfileId: body.doctorProfileId, startsAt: new Date(body.startsAt), reason: body.reason });
  }

  @Get()
  async list(@CurrentActor() actor: Actor) {
    return { appointments: await this.query.list(actor) };
  }

  @Get(':id')
  show(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.query.get(actor, id);
  }

  @Delete(':id/hold')
  @HttpCode(204)
  async releaseHold(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.release.execute(actor, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancelAppointment(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: PatientCancelDto) {
    return this.cancel.execute(actor, id, body.reason ?? null);
  }

  // DA-6: responde la cita nueva (confirmed) con rescheduledFromAppointmentId.
  @Post(':id/reschedule')
  @HttpCode(200)
  rescheduleAppointment(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: RescheduleDto) {
    return this.reschedule.execute(actor, id, new Date(body.startsAt));
  }
}

@Controller('me/doctor/appointments')
@UseGuards(SessionGuard, RolesGuard)
@Roles('doctor')
export class DoctorAppointmentsController {
  constructor(
    private readonly query: DoctorAppointmentsQuery,
    private readonly cancel: CancelByDoctorUseCase,
  ) {}

  @Get()
  async list(@CurrentActor() actor: Actor, @Query() query: DoctorAppointmentsQueryDto) {
    return { appointments: await this.query.list(actor, new Date(query.from), new Date(query.to)) };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancelAppointment(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: DoctorCancelDto) {
    return this.cancel.execute(actor, id, body.reason);
  }
}

@Controller('admin/consultation-price')
@UseGuards(SessionGuard, RolesGuard)
@Roles('admin')
export class AdminConsultationPriceController {
  constructor(private readonly prices: ConsultationPriceService) {}

  @Get()
  current(@CurrentActor() actor: Actor) {
    return this.prices.current(actor);
  }

  @Get('versions')
  async versions(@CurrentActor() actor: Actor) {
    return { versions: await this.prices.versions(actor) };
  }

  @Post('versions')
  publish(@CurrentActor() actor: Actor, @Body() body: PublishPriceDto) {
    return this.prices.publish(actor, body.price);
  }
}

@Controller('admin/appointment-policy')
@UseGuards(SessionGuard, RolesGuard)
@Roles('admin')
export class AdminAppointmentPolicyController {
  constructor(private readonly policies: CancellationPolicyService) {}

  @Get()
  current(@CurrentActor() actor: Actor) {
    return this.policies.current(actor);
  }

  @Get('versions')
  async versions(@CurrentActor() actor: Actor) {
    return { versions: await this.policies.versions(actor) };
  }

  @Post('versions')
  publish(@CurrentActor() actor: Actor, @Body() body: PublishPolicyDto) {
    return this.policies.publish(actor, { ...body });
  }
}

import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../../auth/session.guard';
import { RolesGuard } from '../../../auth/roles.guard';
import { Roles } from '../../../auth/roles.decorator';
import { CurrentActor } from '../../../auth/current-actor.decorator';
import type { Actor } from '../../../common/application/actor';
import {
  AddTimeOffUseCase, ChangeAppointmentDurationUseCase, GetMyAgendaUseCase, PreviewMySlotsUseCase, RemoveTimeOffUseCase,
  ReplaceWeeklyAvailabilityUseCase,
} from '../application/use-cases/agenda.use-cases';
import { AddTimeOffDto, ChangeDurationDto, ReplaceAvailabilityDto, SlotsQueryDto } from './dto/agenda.dto';

// M07 (RF-10, RF-11): agenda del propio médico. El doctorProfileId sale de la sesión, nunca de la petición. Todas las
// horas son del centro de México (D-1); las respuestas lo indican en `timeZone`.
@Controller('me/doctor/agenda')
@UseGuards(SessionGuard, RolesGuard)
@Roles('doctor')
export class MeAgendaController {
  constructor(
    private readonly getAgenda: GetMyAgendaUseCase,
    private readonly replaceAvailability: ReplaceWeeklyAvailabilityUseCase,
    private readonly changeDuration: ChangeAppointmentDurationUseCase,
    private readonly addTimeOff: AddTimeOffUseCase,
    private readonly removeTimeOff: RemoveTimeOffUseCase,
    private readonly previewSlots: PreviewMySlotsUseCase,
  ) {}

  @Get()
  show(@CurrentActor() actor: Actor) {
    return this.getAgenda.execute(actor);
  }

  @Put('availability')
  async availability(@CurrentActor() actor: Actor, @Body() body: ReplaceAvailabilityDto) {
    return { availability: await this.replaceAvailability.execute(actor, body.windows) };
  }

  @Put('duration')
  duration(@CurrentActor() actor: Actor, @Body() body: ChangeDurationDto) {
    return this.changeDuration.execute(actor, body.minutes);
  }

  @Post('time-off')
  timeOff(@CurrentActor() actor: Actor, @Body() body: AddTimeOffDto) {
    return this.addTimeOff.execute(actor, { startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt), reason: body.reason ?? null });
  }

  @Delete('time-off/:id')
  @HttpCode(204)
  async remove(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.removeTimeOff.execute(actor, id);
  }

  @Get('slots')
  slots(@CurrentActor() actor: Actor, @Query() query: SlotsQueryDto) {
    return this.previewSlots.execute(actor, query.from, query.to);
  }
}

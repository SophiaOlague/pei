import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../../auth/session.guard';
import { RolesGuard } from '../../../auth/roles.guard';
import { Roles } from '../../../auth/roles.decorator';
import { CurrentActor } from '../../../auth/current-actor.decorator';
import type { Actor } from '../../../common/application/actor';
import { DoctorSessionUseCases } from '../application/use-cases/doctor-session.use-cases';
import { PatientSessionUseCases } from '../application/use-cases/patient-session.use-cases';

// Videoconsulta (RF-18 a RF-22). El actor sale siempre de la sesión; ninguna ruta recibe cuerpo ni horas del cliente
// (la hora es la del servidor). La cita de otra persona responde 404, igual que en M08.

@Controller('me/patient/appointments/:id/session')
@UseGuards(SessionGuard, RolesGuard)
@Roles('patient')
export class PatientSessionController {
  constructor(private readonly sessions: PatientSessionUseCases) {}

  @Get()
  state(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.state(actor, id);
  }

  @Post('enter')
  @HttpCode(200)
  enter(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.enter(actor, id);
  }

  @Post('presence')
  @HttpCode(200)
  presence(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.presence(actor, id);
  }

  @Post('leave')
  @HttpCode(200)
  leave(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.leave(actor, id);
  }

  @Post('token')
  @HttpCode(200)
  token(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.token(actor, id);
  }
}

@Controller('me/doctor/appointments/:id/session')
@UseGuards(SessionGuard, RolesGuard)
@Roles('doctor')
export class DoctorSessionController {
  constructor(private readonly sessions: DoctorSessionUseCases) {}

  @Get()
  state(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.state(actor, id);
  }

  @Post('enter')
  @HttpCode(200)
  enter(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.enter(actor, id);
  }

  @Post('presence')
  @HttpCode(200)
  presence(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.presence(actor, id);
  }

  @Post('leave')
  @HttpCode(200)
  leave(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.leave(actor, id);
  }

  @Post('admit')
  @HttpCode(200)
  admit(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.admit(actor, id);
  }

  @Post('end')
  @HttpCode(200)
  end(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.end(actor, id);
  }

  @Post('token')
  @HttpCode(200)
  token(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.token(actor, id);
  }
}

@Controller('me/doctor/sessions')
@UseGuards(SessionGuard, RolesGuard)
@Roles('doctor')
export class DoctorSessionsListController {
  constructor(private readonly sessions: DoctorSessionUseCases) {}

  @Get()
  list(@CurrentActor() actor: Actor) {
    return this.sessions.sessionsOf(actor);
  }
}

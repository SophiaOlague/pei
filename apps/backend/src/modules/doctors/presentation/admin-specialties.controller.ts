import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../../auth/session.guard';
import { RolesGuard } from '../../../auth/roles.guard';
import { Roles } from '../../../auth/roles.decorator';
import { CurrentActor } from '../../../auth/current-actor.decorator';
import type { Actor } from '../../../common/application/actor';
import {
  ChangeSpecialtyActivationUseCase,
  CreateSpecialtyUseCase,
  ListAllSpecialtiesUseCase,
  UpdateSpecialtyUseCase,
} from '../application/use-cases/specialties/specialty.use-cases';
import { CreateSpecialtyDto, UpdateSpecialtyDto } from './dto/specialty.dto';

// D-5, R-4, Z-2: administración del catálogo. Solo admin; nunca se elimina una especialidad.
@Controller('admin/specialties')
@UseGuards(SessionGuard, RolesGuard)
@Roles('admin')
export class AdminSpecialtiesController {
  constructor(
    private readonly listAll: ListAllSpecialtiesUseCase,
    private readonly create: CreateSpecialtyUseCase,
    private readonly update: UpdateSpecialtyUseCase,
    private readonly activation: ChangeSpecialtyActivationUseCase,
  ) {}

  @Get()
  list(@CurrentActor() actor: Actor) {
    return this.listAll.execute(actor);
  }

  @Post()
  add(@CurrentActor() actor: Actor, @Body() body: CreateSpecialtyDto) {
    return this.create.execute(actor, body);
  }

  @Patch(':id')
  rename(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateSpecialtyDto) {
    return this.update.execute(actor, id, body);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  deactivate(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.activation.execute(actor, id, false);
  }

  @Post(':id/activate')
  @HttpCode(200)
  activate(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.activation.execute(actor, id, true);
  }
}

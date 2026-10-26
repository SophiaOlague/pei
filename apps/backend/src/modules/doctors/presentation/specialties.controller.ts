import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../../auth/session.guard';
import { ListActiveSpecialtiesUseCase } from '../application/use-cases/specialties/specialty.use-cases';

// D-5, D-33: especialidades que se pueden asignar. Requiere sesión, no un perfil: el médico la elige al registrarse.
@Controller('specialties')
@UseGuards(SessionGuard)
export class SpecialtiesController {
  constructor(private readonly listActive: ListActiveSpecialtiesUseCase) {}

  @Get()
  list() {
    return this.listActive.execute();
  }
}

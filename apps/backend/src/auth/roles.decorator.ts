import { SetMetadata } from '@nestjs/common';
import type { Role } from '../common/domain/role';

export const ROLES_KEY = 'gestinovo:roles';

// Roles que pueden ejecutar una ruta. Se usa junto con @UseGuards(SessionGuard, RolesGuard).
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

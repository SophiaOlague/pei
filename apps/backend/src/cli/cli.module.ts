import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../modules/audit/audit.module';
import { IdentityModule } from '../modules/identity/identity.module';
import { PrivateStorageModule } from '../modules/private-storage/private-storage.module';

// Contexto de Nest para los CLI de operación (sin servidor HTTP): reutiliza los mismos casos de uso,
// la UnitOfWork, la auditoría, el almacenamiento privado y Better Auth que la API.
@Module({ imports: [CommonModule, AuthModule, AuditModule, PrivateStorageModule, IdentityModule] })
export class CliModule {}

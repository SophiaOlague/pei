import { Global, Module } from '@nestjs/common';
import { PRIVATE_OBJECT_STORAGE } from './application/ports/private-object-storage';
import { loadR2Config, R2PrivateObjectStorage } from './infrastructure/r2-private-object-storage';

// Global, igual que AuditModule: cualquier módulo de PEI puede inyectar PRIVATE_OBJECT_STORAGE.
// El adaptador se registra con useFactory (su configuración no es un proveedor de Nest).
@Global()
@Module({
  providers: [{ provide: PRIVATE_OBJECT_STORAGE, useFactory: () => new R2PrivateObjectStorage(loadR2Config()) }],
  exports: [PRIVATE_OBJECT_STORAGE],
})
export class PrivateStorageModule {}

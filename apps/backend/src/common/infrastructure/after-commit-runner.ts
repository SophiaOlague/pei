import { Logger } from '@nestjs/common';
import type { AfterCommitAction } from '../application/ports/after-commit';

// Ejecuta las acciones posteriores al COMMIT en orden. Un fallo se registra y no detiene las demás ni afecta a la
// operación ya confirmada. Sin dependencias de la base de datos (lo usan también los dobles en memoria).
const logger = new Logger('AfterCommit');

export async function runAfterCommitActions(actions: AfterCommitAction[]): Promise<void> {
  for (const action of actions) {
    try {
      await action();
    } catch (error) {
      logger.error(`acción posterior al commit fallida: ${(error as Error)?.message ?? String(error)}`);
    }
  }
}

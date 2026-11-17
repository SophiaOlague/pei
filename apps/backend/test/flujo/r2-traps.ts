import { S3Client } from '@aws-sdk/client-s3';
import { R2PrivateObjectStorage } from '../../src/modules/private-storage/infrastructure/r2-private-object-storage';

// Trampas de R2 para los runners de test/flujo: cualquier llamada al SDK de S3 o al adaptador de R2 cuenta y lanza al
// instante, antes de abrir la red. El recorrido debe terminar con el contador en 0 (todo va al almacén en memoria).
export class R2TrapError extends Error {
  constructor(target: string) {
    super(`Llamada a R2 bloqueada en el runner (${target})`);
    this.name = 'R2TrapError';
  }
}

type Patchable = { prototype: Record<string, unknown> };

export function installR2Traps(): { calls: () => number; restore: () => void } {
  let calls = 0;
  const originals: { target: Patchable; method: string; value: unknown }[] = [];
  const trap = (target: Patchable, method: string, label: string) => {
    originals.push({ target, method, value: target.prototype[method] });
    Object.defineProperty(target.prototype, method, {
      configurable: true,
      writable: true,
      value: function trappedR2Call(): never {
        calls++;
        throw new R2TrapError(label);
      },
    });
  };
  trap(S3Client as unknown as Patchable, 'send', 'S3Client.send');
  for (const method of ['put', 'openForRead', 'delete']) trap(R2PrivateObjectStorage as unknown as Patchable, method, `R2PrivateObjectStorage.${method}`);
  return {
    calls: () => calls,
    restore: () => {
      for (const { target, method, value } of originals) Object.defineProperty(target.prototype, method, { configurable: true, writable: true, value });
    },
  };
}

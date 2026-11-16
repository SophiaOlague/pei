import { Logger } from '@nestjs/common';
import { InProcessWebhookDispatcher } from './in-process-webhook-dispatcher';

describe('InProcessWebhookDispatcher', () => {
  afterEach(() => jest.restoreAllMocks());

  it('procesa después de responder (no dentro de dispatch)', async () => {
    const tasks: (() => void)[] = [];
    const executed: string[] = [];
    const d = new InProcessWebhookDispatcher({ execute: async (id: string) => (executed.push(id), { outcome: 'skipped' as const }) }, (t) => tasks.push(t));
    d.dispatch('evt-1');
    expect(executed).toEqual([]);
    tasks.forEach((t) => t());
    await Promise.resolve();
    expect(executed).toEqual(['evt-1']);
  });

  it('un error inesperado se registra solo con un código', async () => {
    const errors: string[] = [];
    jest.spyOn(Logger.prototype, 'error').mockImplementation((m: unknown) => void errors.push(String(m)));
    const d = new InProcessWebhookDispatcher({ execute: async () => Promise.reject(new Error('detalle con datos sensibles')) }, (t) => t());
    d.dispatch('evt-2');
    await new Promise((r) => setImmediate(r));
    expect(errors).toEqual(['No se pudo procesar el evento de webhook evt-2 (internal)']);
  });
});

import { NestFactory } from '@nestjs/core';
import { db } from '../db';
import { InvalidLegalPublicationError } from '../modules/identity/domain/identity.errors';
import { PublishLegalDocumentsUseCase } from '../modules/identity/application/use-cases/legal-documents.use-cases';
import { main } from './legal-publish';
import { LegalPublishUsageError } from './legal-publish.args';

jest.mock('fs', () => ({ ...jest.requireActual('fs'), readFileSync: jest.fn(() => 'Texto sintético') }));

// main() con el contexto de Nest simulado: no abre conexión. La ejecución contra BD está en test/concurrency.
const ARGS = ['--audience', 'doctor', '--doc', 'doctor_terms@2=a.md', '--target-branch', 'br-a', '--target-endpoint', 'ep-a', '--published-at', '2026-11-01T06:00:00Z'];
const PLAN = {
  target: { kind: 'development', branch: 'br-a', endpoint: 'ep-a', project: 'p' }, audience: 'doctor', documents: [], publishedAt: new Date('2026-11-01T06:00:00Z'),
  pastDateReason: null, current: [], future: [], roles: [], scheduledChanges: [], requirements: [], notices: [],
};

describe('main() de legal:publish', () => {
  const useCase = { simulate: jest.fn(), execute: jest.fn() };
  let log: jest.SpyInstance;
  let create: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase.simulate.mockResolvedValue({ plan: PLAN, confirmation: 'token' });
    useCase.execute.mockResolvedValue({ plan: PLAN, published: [] });
    log = jest.spyOn(console, 'log').mockImplementation();
    create = jest.spyOn(NestFactory, 'createApplicationContext').mockResolvedValue({ get: (t: unknown) => (t === PublishLegalDocumentsUseCase ? useCase : null), close: jest.fn() } as never);
    jest.spyOn(db.$client, 'end').mockResolvedValue(undefined as never);
  });
  afterEach(() => jest.restoreAllMocks());

  it('[TC-M03-267] --dry-run solo simula e indica que no se autorizó ninguna escritura', async () => {
    await expect(main([...ARGS, '--dry-run'])).resolves.toBe(0);
    expect(useCase.simulate).toHaveBeenCalledTimes(1);
    expect(useCase.execute).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join('\n')).toContain('no se autorizó ninguna escritura');
  });

  it('[TC-M03-267] --confirm publica con las autorizaciones recibidas', async () => {
    await expect(main([...ARGS, '--confirm', 'token'])).resolves.toBe(0);
    expect(useCase.simulate).not.toHaveBeenCalled();
    expect(useCase.execute).toHaveBeenCalledWith(expect.objectContaining({ confirmation: 'token', authorizations: { allowProduction: false, acceptRegimeTransition: false, allowProvisionalInProduction: false } }));
  });

  it.each([[[]], [ARGS], [[...ARGS, '--dry-run', '--confirm', 'x']], [[...ARGS, '--dry-run', '--dry-run']]])('[TC-M03-267] argumentos inválidos no abren la conexión: %#', async (argv) => {
    await expect(main(argv)).rejects.toBeInstanceOf(LegalPublishUsageError);
    expect(create).not.toHaveBeenCalled();
  });

  it('[TC-M03-267] cierra la conexión si el caso de uso falla', async () => {
    useCase.execute.mockRejectedValue(new InvalidLegalPublicationError('cambió'));
    await expect(main([...ARGS, '--confirm', 'x'])).rejects.toBeInstanceOf(InvalidLegalPublicationError);
    expect(jest.mocked(db.$client).end).toHaveBeenCalled();
  });
});

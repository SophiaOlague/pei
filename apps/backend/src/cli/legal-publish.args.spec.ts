import { parseLegalPublishArgs, validateLegalPublishArgs } from './legal-publish.args';

describe('Argumentos de legal:publish (plan v2 §6.4)', () => {
  it('[TC-M03-024][N1] interpreta el rol, los documentos tipo@versión=ruta y la fecha común', () => {
    expect(
      parseLegalPublishArgs([
        '--audience', 'patient',
        '--doc', 'privacy_policy@2026-10=./aviso.md',
        '--doc', 'patient_terms@2026-10=./terminos.md',
        '--published-at', '2026-11-01T06:00:00Z',
      ]),
    ).toMatchObject({
      audience: 'patient',
      docs: [
        { type: 'privacy_policy', version: '2026-10', path: './aviso.md' },
        { type: 'patient_terms', version: '2026-10', path: './terminos.md' },
      ],
      publishedAt: new Date('2026-11-01T06:00:00Z'),
      dryRun: false,
      confirm: null,
      allowProduction: false,
    });
  });

  it('[TC-M03-255] interpreta la simulación, el destino y las autorizaciones; por defecto nada está autorizado', () => {
    expect(
      parseLegalPublishArgs([
        '--dry-run', '--target-branch', 'br-a-b', '--target-endpoint', 'ep-a-b', '--confirm', '1.abc', '--allow-production',
        '--accept-regime-transition', '--allow-provisional-production', '--allow-past-date', 'Corrección aprobada',
      ]),
    ).toMatchObject({
      dryRun: true, targetBranch: 'br-a-b', targetEndpoint: 'ep-a-b', confirm: '1.abc', allowProduction: true,
      acceptRegimeTransition: true, allowProvisionalProduction: true, pastDateReason: 'Corrección aprobada',
    });
    expect(parseLegalPublishArgs([])).toMatchObject({ dryRun: false, allowProduction: false, acceptRegimeTransition: false, allowProvisionalProduction: false });
    expect(() => parseLegalPublishArgs(['--confirm'])).toThrow('requiere un valor');
  });

  it.each(['--audience', '--published-at', '--confirm', '--target-branch', '--target-endpoint', '--allow-past-date'])(
    '[TC-M03-265] rechaza la opción repetida o con otra bandera como valor: %s',
    (flag) => {
      const value = flag === '--published-at' ? '2026-11-01T06:00:00Z' : 'valor';
      expect(() => parseLegalPublishArgs([flag, value, flag, value])).toThrow('no se puede repetir');
      expect(() => parseLegalPublishArgs([flag, '--allow-production'])).toThrow('requiere un valor');
      expect(() => parseLegalPublishArgs([flag, '   '])).toThrow('requiere un valor');
    },
  );

  it.each(['--dry-run', '--allow-production', '--accept-regime-transition', '--allow-provisional-production'])('[TC-M03-265] rechaza la bandera repetida: %s', (flag) => {
    expect(() => parseLegalPublishArgs([flag, flag])).toThrow('no se puede repetir');
  });

  it('[TC-M03-265] un argumento desconocido no repite lo recibido', () => {
    expect(() => parseLegalPublishArgs(['postgres://usuario:clave@host/bd'])).toThrow(expect.objectContaining({ message: expect.not.stringContaining('clave') }));
  });

  describe('combinaciones', () => {
    const valid = ['--audience', 'doctor', '--doc', 'doctor_terms@1=a.md', '--target-branch', 'br-a', '--target-endpoint', 'ep-a', '--published-at', '2026-11-01T06:00:00Z'];
    const check = (...extra: string[]) => validateLegalPublishArgs(parseLegalPublishArgs([...valid, ...extra]));

    it('[TC-M03-266] acepta simulación o confirmación', () => {
      expect(check('--dry-run')).toMatchObject({ audience: 'doctor', dryRun: true });
      expect(check('--confirm', '1.abc', '--allow-production')).toMatchObject({ confirm: '1.abc', allowProduction: true });
    });

    it.each([
      ['ambos modos', ['--dry-run', '--confirm', '1.abc'], 'no ambos'],
      ['ningún modo', [], 'no ambos'],
      ['simulación con autorización', ['--dry-run', '--allow-production'], 'no admite'],
      ['simulación con transición', ['--dry-run', '--accept-regime-transition'], 'no admite'],
    ])('[TC-M03-266] rechaza: %s', (_c, extra, message) => {
      expect(() => check(...extra)).toThrow(message);
    });

    it.each([
      ['--audience', '--audience debe'],
      ['--doc', 'al menos un --doc'],
      ['--target-branch', 'obligatorios'],
      ['--target-endpoint', 'obligatorios'],
      ['--published-at', 'obligatorio'],
    ])('[TC-M03-266] rechaza si falta %s', (flag, message) => {
      const i = valid.indexOf(flag);
      expect(() => validateLegalPublishArgs(parseLegalPublishArgs([...valid.slice(0, i), ...valid.slice(i + 2), '--dry-run']))).toThrow(message);
    });
  });

  it.each([
    [['--doc', 'aviso.md']],
    [['--doc', 'tipo_inexistente@1=./a.md']],
    [['--published-at', 'mañana']],
    [['--otro', 'x']],
  ])('[TC-M03-025][N1] rechaza argumentos mal formados: %p', (argv) => {
    expect(() => parseLegalPublishArgs(argv)).toThrow();
  });
});

import { parseLegalPublishArgs } from './legal-publish.args';

describe('Argumentos de legal:publish (plan v2 §6.4)', () => {
  it('[TC-M03-024][N1] interpreta el rol, los documentos tipo@versión=ruta y la fecha común', () => {
    expect(
      parseLegalPublishArgs([
        '--audience', 'patient',
        '--doc', 'privacy_policy@2026-10=./aviso.md',
        '--doc', 'patient_terms@2026-10=./terminos.md',
        '--published-at', '2026-11-01T06:00:00Z',
      ]),
    ).toEqual({
      audience: 'patient',
      docs: [
        { type: 'privacy_policy', version: '2026-10', path: './aviso.md' },
        { type: 'patient_terms', version: '2026-10', path: './terminos.md' },
      ],
      publishedAt: new Date('2026-11-01T06:00:00Z'),
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

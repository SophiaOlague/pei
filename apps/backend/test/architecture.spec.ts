import { readdirSync, readFileSync } from 'fs';
import { join, relative, sep } from 'path';

// Reglas de dependencias entre módulos (M03 R-11, P.7). Analiza los imports del código fuente: no ejecuta nada.

const SRC = join(__dirname, '..', 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

const IMPORT = /(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;

function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(IMPORT)].map((match) => match[1] ?? match[2]);
}

const files = sourceFiles(SRC).map((path) => ({ path: relative(SRC, path).split(sep).join('/'), imports: importsOf(path) }));

describe('Arquitectura: dependencias permitidas (R-11)', () => {
  it('[RT-M03-08][R-11] solo el adaptador de private-storage importa el SDK de AWS', () => {
    const offenders = files
      .filter((file) => file.imports.some((spec) => spec.startsWith('@aws-sdk/')))
      .map((file) => file.path)
      .filter((path) => !path.startsWith('modules/private-storage/infrastructure/'));
    expect(offenders).toEqual([]);
  });

  it('[RT-M03-09][R-11] ningún módulo importa el adaptador R2 directamente; solo el módulo private-storage lo registra', () => {
    const offenders = files
      .filter((file) => file.imports.some((spec) => spec.includes('private-storage/infrastructure/')))
      .map((file) => file.path)
      .filter((path) => !path.startsWith('modules/private-storage/'));
    expect(offenders).toEqual([]);
  });

  it('[RT-M03-10][R-11] private-storage no depende de identity', () => {
    const offenders = files
      .filter((file) => file.path.startsWith('modules/private-storage/'))
      .filter((file) => file.imports.some((spec) => /(^|\/)identity\//.test(spec)))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it('[RT-M03-11][P.7] identity no depende de doctors', () => {
    const offenders = files
      .filter((file) => file.path.startsWith('modules/identity/'))
      .filter((file) => file.imports.some((spec) => /(^|\/)doctors\//.test(spec)))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it('[RT-M03-12][P.7] doctors no importa la infraestructura ni la presentación de identity', () => {
    const offenders = files
      .filter((file) => file.path.startsWith('modules/doctors/'))
      .filter((file) => file.imports.some((spec) => /identity\/(infrastructure|presentation)\//.test(spec)))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it('[RT-M03-14][P.7] doctors solo usa de identity su dominio, sus puertos, el registro de secciones y el módulo', () => {
    const allowed = /identity\/(domain\/|application\/ports\/|application\/role-profile-section\.registry$|identity\.module$)/;
    const offenders = files
      .filter((file) => file.path.startsWith('modules/doctors/'))
      .flatMap((file) => file.imports.filter((spec) => /(^|\/)identity\//.test(spec) && !allowed.test(spec)).map((spec) => `${file.path} → ${spec}`));
    expect(offenders).toEqual([]);
  });

  it('[RT-M03-15][R-11] doctors no importa el SDK de AWS ni la infraestructura de private-storage', () => {
    const offenders = files
      .filter((file) => file.path.startsWith('modules/doctors/'))
      .filter((file) => file.imports.some((spec) => spec.startsWith('@aws-sdk/') || spec.includes('private-storage/infrastructure/')))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it('[RT-M03-16][B8] el spec de concurrencia confirma datos: exige C2 y una marca explícita (rama desechable, o `rama` con aceptación)', () => {
    const source = readFileSync(join(__dirname, 'concurrency', 'doctors.conc-spec.ts'), 'utf8');
    const call = source.search(/^assertC2BranchTarget\(\);$/m);
    const guard = source.search(/if \(!allowed\)/);
    const firstSuite = source.search(/^describe\(/m);
    expect(call).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(call);
    expect(firstSuite).toBeGreaterThan(guard);
    expect(source).toMatch(/C2_EXPECTED_BRANCH === RAMA\s*\? process\.env\.C2_COMMITTED_FIXTURES === 'rama-permanent-accepted'/);
    expect(source).toMatch(/: process\.env\.C2_COMMITTED_FIXTURES === 'disposable-branch'/);
  });
});

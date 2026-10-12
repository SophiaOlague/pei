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
});

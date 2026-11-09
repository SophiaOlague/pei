import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// La parte B de M-1 (0014) no está autorizada: ningún lanzador debe poder ejecutar TC-M08-307 por accidente.
// Pruebas de código fuente, sin conexiones.
const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const PART_B = 'test/integration/m08-m1-part-b.int-spec.ts';

describe('M-1 parte B (0014) bloqueada', () => {
  it('[TC-M08-340] el spec de parte B se detiene al cargarse sin M08_PART_B_AUTHORIZED=0014, antes de cualquier suite y de leer 0014', () => {
    const source = read(PART_B);
    const gate = source.search(/^if \(process\.env\.M08_PART_B_AUTHORIZED !== '0014'\) \{\r?\n\s+throw new Error/m);
    expect(gate).toBeGreaterThan(-1);
    expect(source.search(/^describe\(/m)).toBeGreaterThan(gate);
    expect(source.indexOf("file('0014_")).toBeGreaterThan(gate);
  });

  it('[TC-M08-341] TC-M08-307 existe solo en el spec de parte B, y solo ese spec lee 0014', () => {
    const dirs = ['test/integration', 'test/concurrency', 'test/support', 'test'];
    const files = dirs.flatMap((d) => readdirSync(join(ROOT, d)).filter((f) => f.endsWith('.ts')).map((f) => `${d}/${f}`));
    const self = 'test/support/m08-m1-part-b-gate.spec.ts';
    const with307 = files.filter((f) => f !== self && read(f).includes('[TC-M08-307]'));
    const with0014 = files.filter((f) => f !== self && /0014_m08_m1_legal_acceptance/.test(read(f)));
    expect(with307).toEqual([PART_B]);
    expect(with0014).toEqual([PART_B]);
  });

  it('[TC-M08-342] el lanzador C2 no puede transmitir M08_PART_B_AUTHORIZED (ni desde .env.c2 ni desde el proceso padre)', () => {
    const launcher = read('test/support/c2-launcher.ts');
    expect(launcher).not.toMatch(/M08_PART_B_AUTHORIZED/);
    // Lista blanca del sistema: solo rutas y variables de Windows; nada que empiece por M08_.
    const system = launcher.match(/const SYSTEM_KEYS = \[([^\]]*)\]/)?.[1] ?? '';
    expect(system).not.toBe('');
    expect(system).not.toMatch(/M08_/);
    expect(read('scripts/c2-run.ts')).not.toMatch(/M08_PART_B_AUTHORIZED/);
  });
});

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

  it('[RT-M07-01][D-2] agenda usa de doctors solo la política operativa y el módulo; doctors no depende de agenda', () => {
    const allowed = /doctors\/(application\/policies\/doctor-operational\.policy|doctors\.module)$/;
    const offenders = files
      .filter((file) => file.path.startsWith('modules/agenda/') && !file.path.endsWith('.spec.ts'))
      .flatMap((file) => file.imports.filter((spec) => /(^|\/)doctors\//.test(spec) && !allowed.test(spec)).map((spec) => `${file.path} → ${spec}`));
    const reverse = files
      .filter((file) => file.path.startsWith('modules/doctors/'))
      .filter((file) => file.imports.some((spec) => /(^|\/)agenda\//.test(spec)))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
    expect(reverse).toEqual([]);
  });

  it('[RT-M07-02] agenda no importa citas, pagos ni videoconsulta (fuera del alcance de M07)', () => {
    const offenders = files
      .filter((file) => file.path.startsWith('modules/agenda/'))
      .filter((file) => file.imports.some((spec) => /(^|\/)(appointments|payments|video[\w-]*)\//.test(spec)))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it('[RT-M03-15][R-11] doctors no importa el SDK de AWS ni la infraestructura de private-storage', () => {
    const offenders = files
      .filter((file) => file.path.startsWith('modules/doctors/'))
      .filter((file) => file.imports.some((spec) => spec.startsWith('@aws-sdk/') || spec.includes('private-storage/infrastructure/')))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it('[RT-M03-16][B8] el spec de concurrencia confirma datos: exige C2 y la marca explícita de la rama C2 persistente aprobada', () => {
    const source = readFileSync(join(__dirname, 'concurrency', 'doctors.conc-spec.ts'), 'utf8');
    const call = source.search(/^assertC2BranchTarget\(\);$/m);
    const guard = source.search(/if \(!allowed\)/);
    const firstSuite = source.search(/^describe\(/m);
    expect(call).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(call);
    expect(firstSuite).toBeGreaterThan(guard);
    expect(source).toMatch(/process\.env\.C2_EXPECTED_BRANCH === C2_TARGET\.branch && process\.env\.C2_COMMITTED_FIXTURES === C2_PERSISTENT_FIXTURES/);
    expect(source).not.toMatch(/disposable-branch|rama-permanent-accepted/);
  });

  it('[RT-M03-17] doctors.int-spec libera el pool de src/db al terminar y comprueba que quedó vacío', () => {
    const source = readFileSync(join(__dirname, 'integration', 'doctors.int-spec.ts'), 'utf8');
    const afterAll = source.slice(source.search(/^  afterAll\(/m));
    expect(afterAll).toMatch(/finally \{[\s\S]*await db\.\$client\.end\(\);[\s\S]*expect\(db\.\$client\.totalCount\)\.toBe\(0\);/);
  });

  it('[RT-M03-18] admin-bootstrap-better-auth conserva sus seis escenarios; los dos de bootstrap inicial están marcados como pendientes en C2', () => {
    const source = readFileSync(join(__dirname, 'integration', 'admin-bootstrap-better-auth.int-spec.ts'), 'utf8');
    const always = source.match(/^  it\('\[TC-M02-(118|119|120)\]/gm) ?? [];
    const initial = source.match(/^  itInitialBootstrap\(`\[TC-M02-121\]/gm) ?? [];
    expect(always).toHaveLength(4);
    expect(initial).toHaveLength(2);
    expect(source).toMatch(/caso de uso con Drizzle: perfil admin y auditoría, un solo correo; repetir aborta/);
    expect(source).toMatch(/H1 con el esquema real: una cuenta del registro público \(con contraseña\) hace abortar el bootstrap/);
    expect(source).toMatch(/const itInitialBootstrap = IN_C2_WITH_ADMIN \? it\.skip : it;/);
    expect(source).toMatch(/\[pendiente en C2: la rama ya tiene administrador\]/);
    expect(source).toMatch(/^  it\('\[TC-M03-293\]/m);
    // Todas las pruebas ejecutables usan withRollback y el pool se cierra al final.
    expect((source.match(/await withRollback\(/g) ?? []).length).toBe(7);
    expect(source).toMatch(/finally \{[\s\S]*await db\.\$client\.end\(\);[\s\S]*expect\(db\.\$client\.totalCount\)\.toBe\(0\);/);
  });
});

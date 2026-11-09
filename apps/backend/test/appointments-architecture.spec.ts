import { readdirSync, readFileSync } from 'fs';
import { join, relative, sep } from 'path';

// M08: reglas de dependencias (RT-M08-xx). Analiza los imports del código fuente: no ejecuta nada.
const SRC = join(__dirname, '..', 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}
const IMPORT = /(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/g;
const files = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path).split(sep).join('/'),
  text: readFileSync(path, 'utf8'),
  imports: [...readFileSync(path, 'utf8').matchAll(IMPORT)].map((m) => m[1]),
}));
const m08 = files.filter((f) => f.path.startsWith('modules/appointments/'));

describe('Arquitectura de M08 (citas)', () => {
  it('[RT-M08-01][AP-26] de módulos anteriores, M08 usa solo AgendaService, DoctorOperationalPolicy, CanBookAppointmentsPolicy, el lector de aceptaciones legales para reservas y sus módulos', () => {
    const allowed = [
      /agenda\/(application\/use-cases\/agenda\.use-cases|agenda\.module)$/,
      /doctors\/(application\/policies\/doctor-operational\.policy|doctors\.module)$/,
      /identity\/(application\/policies\/can-book-appointments|application\/ports\/booking-legal-acceptance\.reader|identity\.module)$/,
    ];
    const offenders = m08.flatMap((f) =>
      f.imports
        .filter((spec) => /(^|\/)(agenda|doctors|identity)\//.test(spec) && !allowed.some((re) => re.test(spec)))
        .map((spec) => `${f.path} → ${spec}`),
    );
    expect(offenders).toEqual([]);
  });

  it('[RT-M08-02] ningún módulo de M00 a M07 importa M08 (sin dependencias circulares)', () => {
    const offenders = files
      .filter((f) => f.path.startsWith('modules/') && !f.path.startsWith('modules/appointments/'))
      .filter((f) => f.imports.some((spec) => /(^|\/)appointments\//.test(spec)))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('[RT-M08-03] M08 no importa pagos, videoconsulta ni notificaciones', () => {
    const offenders = m08.filter((f) => f.imports.some((spec) => /(^|\/)(payments|video[\w-]*|notifications?)\//.test(spec))).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('[RT-M08-04][AP-16] ningún controller usa el servicio de confirmación: no hay ruta que confirme citas', () => {
    const code = (t: string) => t.replace(/\/\/.*$/gm, '');
    const offenders = files.filter((f) => /@Controller\(/.test(f.text) && /AppointmentConfirmationService|confirmPaid/.test(code(f.text))).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  // M-1 (0013) está aplicada: DA-3 guarda agenda_block_ends_at (solo ocupación) y DA-6 usa rescheduled.
  it('[RT-M08-05][AP-23] M08 no usa meeting.ended_at; el fin del bloque no sale en contratos de integración ni en la presentación', () => {
    const code = (t: string) => t.replace(/\/\/.*$/gm, '');
    expect(m08.filter((f) => /endedAt|ended_at/.test(code(f.text))).map((f) => f.path)).toEqual([]);
    const exposed = m08.filter((f) => /\/(integration|presentation)\//.test(f.path) && /agendaBlockEndsAt|agenda_block_ends_at/.test(code(f.text)));
    expect(exposed.map((f) => f.path)).toEqual([]);
  });

  it('[RT-M08-06][DA-6] solo el caso de uso de reagendamiento lleva una cita al estado rescheduled', () => {
    const offenders = m08.filter((f) => /status:\s*'rescheduled'/.test(f.text)).map((f) => f.path);
    expect(offenders).toEqual(['modules/appointments/application/use-cases/reschedule.use-cases.ts']);
  });

  // M-1c: hasta aplicar 0015 (NOT NULL), la garantía de que no nacen citas sin fin de bloque es del código.
  it('[RT-M08-07][DA-3][M-1c] todo INSERT de appointment en src escribe agendaBlockEndsAt', () => {
    const inserts = files.flatMap((f) => [...f.text.matchAll(/insert\(appointment\)\.values\(\{([\s\S]*?)\}\)/g)].map((m) => ({ path: f.path, body: m[1] })));
    expect(inserts.length).toBeGreaterThan(0);
    expect(inserts.filter((i) => !/agendaBlockEndsAt:/.test(i.body)).map((i) => i.path)).toEqual([]);
  });

  it('[RT-M08-08][M-1c] 0015 no rellena datos, exige 0013 y 0014, se detiene ante nulos y es idéntica a la propuesta', () => {
    const dir = join(SRC, 'db', 'proposals', 'm08-m1c');
    const up = readFileSync(join(dir, '0015_m08_m1c_agenda_block_not_null.up.sql'), 'utf8');
    const code = up.replace(/--.*$/gm, '');
    expect(code).not.toMatch(/\b(update|insert|delete)\b/i);
    expect(code).toMatch(/0015 requiere 0013/);
    expect(code).toMatch(/0015 requiere 0014/);
    expect(code).toMatch(/agenda_block_ends_at is null[\s\S]*raise exception/);
    expect(code).toMatch(/alter column agenda_block_ends_at set not null/);
    // Registrada en Drizzle (idx 15) con el SQL idéntico a la propuesta.
    expect(readFileSync(join(SRC, 'db', 'migrations', '0015_m08_m1c_agenda_block_not_null.sql'), 'utf8')).toBe(up);
    const journal = JSON.parse(readFileSync(join(SRC, 'db', 'migrations', 'meta', '_journal.json'), 'utf8')) as { entries: { idx: number; tag: string }[] };
    expect(journal.entries.at(-1)).toMatchObject({ idx: 15, tag: '0015_m08_m1c_agenda_block_not_null' });
  });
});

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { AppointmentsModule } from '../../appointments.module';
import { CanceledAppointmentFeedService } from './canceled-appointment-feed';

// M08 · A.25 · reglas de arquitectura del contrato de cancelaciones (análisis del código fuente; no ejecuta nada).
// Archivo propio para no tocar test/appointments-architecture.spec.ts (con cambios pendientes de otra tarea).
const SRC = join(__dirname, '..', '..', '..', '..');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });
const files = walk(SRC).map((p) => ({ path: relative(SRC, p).split(sep).join('/'), source: readFileSync(p, 'utf8') }));
const code = (s: string) => s.replace(/\/\/.*$/gm, '');
const FEED = 'modules/appointments/application/integration/canceled-appointment-feed.ts';
const READER = 'modules/appointments/infrastructure/persistence/drizzle-canceled-appointment-audit.reader.ts';

describe('A.25 · arquitectura', () => {
  it('ningún controller usa la consulta de cancelaciones (sin ruta HTTP, AP-16)', () => {
    const offenders = files.filter((f) => /@Controller\(/.test(f.source) && /CanceledAppointmentFeed|CANCELED_APPOINTMENT_AUDIT_READER/.test(code(f.source))).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('M08 sigue sin depender de pagos (RT-M08-03)', () => {
    const offenders = files.filter((f) => f.path.startsWith('modules/appointments/') && /from\s+['"][^'"]*payments/.test(f.source)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('el contrato no expone importes, comisiones ni datos personales', () => {
    const source = files.find((f) => f.path === FEED)!.source;
    const notice = /export interface CanceledAppointmentNotice \{([\s\S]*?)\n\}/.exec(source)![1];
    expect(code(notice)).not.toMatch(/price|amount|fee|reason|name|email|phone/i);
  });

  it('el lector es de solo lectura (sin insert, update ni delete)', () => {
    const reader = code(files.find((f) => f.path === READER)!.source);
    expect(reader).not.toMatch(/\.(insert|update|delete)\(/);
  });

  it('AppointmentsModule lo registra y lo exporta', () => {
    expect(Reflect.getMetadata('exports', AppointmentsModule)).toContain(CanceledAppointmentFeedService);
    expect(Reflect.getMetadata('providers', AppointmentsModule)).toContain(CanceledAppointmentFeedService);
  });
});

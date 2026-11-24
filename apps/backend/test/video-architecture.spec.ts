import { readdirSync, readFileSync } from 'fs';
import { join, relative, sep } from 'path';

// Videoconsulta: reglas de dependencias (RT-VID-xx). Analiza los imports del código fuente: no ejecuta nada.
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
const video = files.filter((f) => f.path.startsWith('modules/video/'));

describe('Arquitectura de videoconsulta', () => {
  it('[RT-VID-01] de M08 usa solo AppointmentSessionService (contrato CC-9), sus errores de dominio y el módulo', () => {
    const allowed = [/appointments\/application\/integration\/appointment-integration\.services$/, /appointments\/domain\/appointments\.errors$/, /appointments\/appointments\.module$/];
    const offenders = video.flatMap((f) => f.imports.filter((spec) => /(^|\/)appointments\//.test(spec) && !allowed.some((a) => a.test(spec))).map((spec) => `${f.path} → ${spec}`));
    expect(offenders).toEqual([]);
  });

  it('[RT-VID-02] de M03 usa solo DoctorOperationalPolicy, isOperational y el módulo, y solo desde la infraestructura y el módulo', () => {
    const offenders = video.flatMap((f) =>
      f.imports
        .filter((spec) => /(^|\/)doctors\//.test(spec))
        .filter((spec) => !(/doctors\/application\/policies\/doctor-operational\.policy$|doctors\/domain\/doctor-status$|doctors\/doctors\.module$/.test(spec) && /^(modules\/video\/infrastructure\/|modules\/video\/video\.module\.ts$)/.test(f.path)))
        .map((spec) => `${f.path} → ${spec}`),
    );
    expect(offenders).toEqual([]);
  });

  it('[RT-VID-03] videoconsulta no importa pagos ni el SDK de ningún proveedor de video', () => {
    const offenders = video.filter((f) => f.imports.some((spec) => /(^|\/)payments\/|realtimekit|@cloudflare/.test(spec))).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('[RT-VID-04] solo M08 cambia el estado de la cita: videoconsulta no escribe en appointment ni en su historial', () => {
    const repo = video.find((f) => f.path.endsWith('drizzle-meeting.repository.ts'))!;
    expect(repo.text).not.toMatch(/\.(insert|update|delete)\(\s*(appointment|appointmentStatusHistory)\b/);
  });

  it('[RT-VID-05][decisión 11] la única operación del médico sin canOperate es la finalización (además de las lecturas)', () => {
    const doctor = video.find((f) => f.path.endsWith('doctor-session.use-cases.ts'))!.text;
    const method = (name: string) => {
      const start = doctor.indexOf(`  ${name}(actor: Actor`);
      const next = doctor.indexOf('\n  }\n', start);
      return doctor.slice(start, next);
    };
    for (const name of ['enter', 'presence', 'leave', 'admit', 'token']) expect(method(name)).toContain('this.openOperational(actor, appointmentId)');
    expect(method('end')).not.toContain('openOperational');
    expect(method('end')).not.toContain('assertCanOperate');
  });

  it('[RT-VID-06][decisión 12] no hay cierre automático: solo end() pasa una meeting a ended', () => {
    const writers = video.filter((f) => /status: 'ended'/.test(f.text)).map((f) => f.path);
    expect(writers).toEqual(['modules/video/application/use-cases/doctor-session.use-cases.ts']);
  });
});

// Videoconsulta (0019): pruebas ESTÁTICAS, sin base de datos. Comprueban que la migración está registrada, protegida,
// sin autorizar en ningún ejecutor, que solo hace cambios aditivos y que coincide con Drizzle y su snapshot.
// La aplicación real (C2, después desarrollo) requiere una autorización expresa: no se ejecuta aquí.
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { meeting } from '../src/db/schema/appointment';
import { meetingSessionEventTypeEnum, refundReasonEnum } from '../src/db/schema/enums';
import { AUTHORIZED_MIGRATIONS } from '../scripts/c2-migrate-core';
import { DEV_AUTHORIZED_MIGRATIONS } from '../scripts/dev-migrate-core';
import { PROTECTED_MIGRATIONS } from '../scripts/migration-authorization';

const BACKEND = join(__dirname, '..');
const MIGRATIONS = join(BACKEND, 'src', 'db', 'migrations');
const PROPOSALS = join(BACKEND, 'src', 'db', 'proposals', 'video-v1');
const read = (p: string) => readFileSync(p, 'utf8');
const UP = read(join(PROPOSALS, '0019_video_v1.up.sql'));
const DOWN = read(join(PROPOSALS, '0019_video_v1.down.sql'));
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const noComments = (sql: string) => sql.replace(/--.*$/gm, '');

describe('Videoconsulta · migración 0019 (escrita, protegida y sin aplicar)', () => {
  it('[TC-VID-200] la migración es idéntica a la propuesta y es la entrada 19 del journal; su snapshot encadena con 0018', () => {
    expect(read(join(MIGRATIONS, '0019_video_v1.sql'))).toBe(UP);
    const journal = JSON.parse(read(join(MIGRATIONS, 'meta', '_journal.json'))) as { entries: { idx: number; tag: string; when: number }[] };
    expect(journal.entries).toHaveLength(20);
    expect(journal.entries[19]).toMatchObject({ idx: 19, tag: '0019_video_v1' });
    expect(journal.entries[19].when).toBeGreaterThan(journal.entries[18].when);
    const s18 = JSON.parse(read(join(MIGRATIONS, 'meta', '0018_snapshot.json'))) as { id: string };
    const s19 = JSON.parse(read(join(MIGRATIONS, 'meta', '0019_snapshot.json'))) as { prevId: string };
    expect(s19.prevId).toBe(s18.id);
  });

  it('[TC-VID-201][R-1] es protegida: su primera comprobación es pei.migration_authorized = 0019 y rechaza la autorización persistente', () => {
    expect(PROTECTED_MIGRATIONS['0019_video_v1']).toBe('0019');
    const body = UP.slice(UP.indexOf('begin'));
    expect(body.slice(body.indexOf('if '))).toMatch(/^if coalesce\(current_setting\('pei\.migration_authorized', true\), ''\) <> '0019' then\n\s+raise exception '0019 requiere autorización explícita/);
    expect(UP).toMatch(/from pg_db_role_setting where array_to_string\(setconfig, ','\) like '%pei\.migration_authorized%'/);
  });

  it('[TC-VID-202] autorizada en C2 y en desarrollo (2026-11-22), cada una con el SHA-256 de su SQL', () => {
    for (const list of [AUTHORIZED_MIGRATIONS, DEV_AUTHORIZED_MIGRATIONS] as unknown as { idx: number }[][]) {
      expect(list.filter((m) => m.idx >= 19)).toEqual([{ idx: 19, tag: '0019_video_v1', sha256: sha(join(MIGRATIONS, '0019_video_v1.sql')) }]);
    }
  });

  it('[TC-VID-203] solo hace cambios aditivos: sin CREATE TABLE, DROP, UPDATE, DELETE, INSERT ni TRUNCATE de datos', () => {
    const ddl = noComments(UP.slice(UP.indexOf('end $$;') + 'end $$;'.length)).trim().split(/;\s*/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    expect(ddl).toEqual([
      "alter type meeting_session_event_type_enum add value 'left_voluntarily'",
      "alter type refund_reason_enum add value 'no_show_doctor'",
      "alter type refund_reason_enum add value 'no_show_both'",
      'alter table meeting alter column room_id drop not null',
      'alter table meeting add column patient_last_seen_at timestamp with time zone',
      'alter table meeting add column doctor_last_seen_at timestamp with time zone',
      'alter table meeting add column patient_provider_participant_id varchar',
      'alter table meeting add column doctor_provider_participant_id varchar',
      'create trigger meeting_session_event_append_only before update or delete on meeting_session_event for each row execute function gst_append_only()',
      'create trigger meeting_session_event_no_truncate before truncate on meeting_session_event for each statement execute function gst_no_truncate()',
    ]);
  });

  it('[TC-VID-204] coincide con Drizzle: enums ampliados, room_id opcional y único, columnas nuevas opcionales', () => {
    expect(meetingSessionEventTypeEnum.enumValues).toEqual(['joined', 'left', 'left_voluntarily']);
    expect(refundReasonEnum.enumValues.slice(-2)).toEqual(['no_show_doctor', 'no_show_both']);
    const columns = Object.fromEntries(getTableConfig(meeting).columns.map((c) => [c.name, c]));
    expect(columns.room_id.notNull).toBe(false);
    expect(columns.room_id.isUnique).toBe(true);
    for (const name of ['patient_last_seen_at', 'doctor_last_seen_at', 'patient_provider_participant_id', 'doctor_provider_participant_id']) {
      expect(columns[name].notNull).toBe(false);
    }
  });

  it('[TC-VID-205] la reversión no borra datos: exige meeting, meeting_session_event y reembolsos por inasistencia vacíos', () => {
    expect(DOWN).toMatch(/exists \(select 1 from meeting\) or exists \(select 1 from meeting_session_event\)/);
    expect(DOWN).toMatch(/reason::text in \('no_show_doctor', 'no_show_both'\)/);
    expect(noComments(DOWN)).not.toMatch(/\b(delete from|truncate|update \w+ set)\b/i);
  });

  it('[TC-VID-206] las migraciones 0017 y 0018 no se modificaron', () => {
    expect(sha(join(MIGRATIONS, '0017_payments_f1.sql'))).toBe('5593858840293a7d46866dbd37ada7345c5616cda84db1c566a37b8f840944b1');
    expect(sha(join(MIGRATIONS, '0018_payments_stripe_provider.sql'))).toBe('f15b342a27a8367b94b1be5dc62a550096891e6e9b8d8e786ab2dda25029be56');
  });
});

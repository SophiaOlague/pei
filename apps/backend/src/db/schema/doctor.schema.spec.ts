import { readFileSync } from 'fs';
import { join } from 'path';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { doctorIdentityVerification, doctorLicenseVerification, doctorProfile, LICENSE_NUMBER_PATTERN } from './doctor';
import { doctorLicenseReviewReasonEnum, doctorReviewStatusEnum } from './enums';

// M03 B2 (plan v2 §3, 0010 y 0011; §7, §8): comprobación estática del schema y del SQL generado. No usa la BD:
// las restricciones se ejercerán contra PostgreSQL en la integración de PC-B2 (rama temporal).

const byText = (a?: string, b?: string) => (a ?? '').localeCompare(b ?? '');
const MIGRATIONS = join(__dirname, '..', 'migrations');
const sqlOf = (file: string) => readFileSync(join(MIGRATIONS, file), 'utf8');
const statements = (file: string) =>
  sqlOf(file)
    .split('--> statement-breakpoint')
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);

const names = (table: Parameters<typeof getTableConfig>[0]) => {
  const config = getTableConfig(table);
  return {
    columns: config.columns.map((c) => c.name),
    checks: config.checks.map((c) => c.name).sort(byText),
    indexes: config.indexes.map((i) => i.config.name).sort(byText),
    uniques: config.uniqueConstraints.map((u) => u.getName()).sort(byText),
    nullable: config.columns.filter((c) => !c.notNull).map((c) => c.name).sort(byText),
  };
};

describe('Schema de médicos (M03 B2)', () => {
  it('[TC-M03-093][R-7][N3] doctor_profile: columnas finales sin estado persistido ni columnas heredadas', () => {
    const profile = names(doctorProfile);
    expect(profile.columns).toEqual([
      'id', 'user_profile_id', 'license_number', 'bio', 'appointment_duration_minutes', 'rating_avg', 'created_at',
      'updated_at', 'specialty_id', 'photo_object_key', 'identity_revision', 'professional_revision',
    ]);
    for (const legacy of ['specialty', 'license_document_url', 'photo_url', 'verification_status', 'reviewed_by', 'reviewed_at', 'rejection_reason']) {
      expect(profile.columns).not.toContain(legacy);
    }
    // license_number admite NULL hasta el primer envío de cédula (§7bis.2).
    expect(profile.nullable).toEqual(['bio', 'license_number', 'photo_object_key']);
    expect(profile.checks).toEqual(['doctor_profile_license_number_format_chk', 'doctor_profile_revisions_chk']);
    expect(profile.indexes).toEqual(['doctor_profile_specialty_idx']);
  });

  it('[TC-M03-094][R-2][D-27] enums de revisión: cuatro estados (superseded incluido) y seis motivos de cédula', () => {
    expect(doctorReviewStatusEnum.enumValues).toEqual(['pending', 'approved', 'rejected', 'superseded']);
    expect(doctorLicenseReviewReasonEnum.enumValues).toEqual([
      'initial', 'resubmission', 'license_number_changed', 'license_document_changed', 'specialty_changed', 'legal_name_changed',
    ]);
  });

  it('[TC-M03-095][D-19][D-27] doctor_identity_verification: historial por intento, un pendiente y purga coherente', () => {
    const t = names(doctorIdentityVerification);
    expect(t.uniques).toEqual(['doctor_identity_verification_doctor_attempt_uq']);
    expect(t.checks).toEqual([
      'doctor_identity_verification_attempt_chk',
      'doctor_identity_verification_keys_chk',
      'doctor_identity_verification_no_pending_purge_chk',
      'doctor_identity_verification_reason_chk',
      'doctor_identity_verification_reviewed_chk',
    ]);
    expect(t.indexes).toEqual([
      'doctor_identity_verification_doctor_idx',
      'doctor_identity_verification_one_pending_uq',
      'doctor_identity_verification_status_created_idx',
    ]);
    expect(t.nullable).toEqual(['documents_deleted_at', 'ine_back_object_key', 'ine_front_object_key', 'rejection_reason', 'reviewed_at', 'reviewed_by']);
  });

  it('[TC-M03-096][D-4][D-16][C-4] doctor_license_verification: conserva número, especialidad y versión; sin purga', () => {
    const t = names(doctorLicenseVerification);
    expect(t.columns).toEqual(expect.arrayContaining(['professional_revision', 'reason', 'license_number', 'specialty_id', 'document_object_key']));
    expect(t.columns).not.toContain('documents_deleted_at');
    expect(t.nullable).toEqual(['rejection_reason', 'reviewed_at', 'reviewed_by']);
    expect(t.uniques).toEqual(['doctor_license_verification_doctor_attempt_uq']);
    expect(t.checks).toEqual([
      'doctor_license_verification_attempt_chk',
      'doctor_license_verification_number_chk',
      'doctor_license_verification_reason_chk',
      'doctor_license_verification_reviewed_chk',
    ]);
    expect(t.indexes).toEqual([
      'doctor_license_verification_doctor_idx',
      'doctor_license_verification_one_pending_uq',
      'doctor_license_verification_status_created_idx',
    ]);
  });

  it('[TC-M03-097][R-6] el patrón del número de cédula es el de R-6', () => {
    const re = new RegExp(LICENSE_NUMBER_PATTERN);
    for (const ok of ['1234567', 'AB-12', 'a'.repeat(20)]) expect(re.test(ok)).toBe(true);
    for (const bad of ['', 'a'.repeat(21), '12 34', '12_34', 'ñ1']) expect(re.test(bad)).toBe(false);
  });
});

describe('SQL de 0010 y 0011 (M03 B2, sin aplicar)', () => {
  it('[TC-M03-098][plan v2 §3] 0010 solo elimina lo previsto, después del guard de 0 filas', () => {
    const s = statements('0010_m03_doctor_profile_drop_legacy.sql');
    expect(s[0]).toMatch(/IF EXISTS \(SELECT 1 FROM doctor_profile\)[\s\S]*errcode = 'P0001'/);
    expect(s.slice(1).sort(byText)).toEqual(
      [
        'ALTER TABLE "doctor_profile" DROP CONSTRAINT "doctor_profile_reviewed_by_user_profile_id_fk";',
        'ALTER TABLE "doctor_profile" ALTER COLUMN "license_number" DROP NOT NULL;',
        ...['specialty', 'license_document_url', 'photo_url', 'verification_status', 'reviewed_by', 'reviewed_at', 'rejection_reason'].map(
          (c) => `ALTER TABLE "doctor_profile" DROP COLUMN "${c}";`,
        ),
        'DROP TYPE "public"."doctor_verification_status_enum";',
        'DROP TYPE "public"."specialty_enum";',
      ].sort(byText),
    );
  });

  it('[TC-M03-099][plan v2 §3] 0011 solo agrega: ningún DROP, RENAME, DELETE, UPDATE ni TRUNCATE', () => {
    const text = statements('0011_m03_doctor_verifications.sql').join('\n');
    // Las acciones referenciales de las FK (ON DELETE / ON UPDATE) no son sentencias destructivas.
    const withoutFkActions = text.replace(/ON (DELETE|UPDATE) (restrict|no action|cascade|set null)/gi, '');
    expect(withoutFkActions).not.toMatch(/\b(DROP|RENAME|DELETE|UPDATE|TRUNCATE|INSERT)\b/i);
    expect(text).toMatch(/ALTER TABLE "doctor_profile" ADD COLUMN "specialty_id" uuid NOT NULL;/);
    expect(text).toMatch(/"doctor_profile_specialty_id_specialty_id_fk" FOREIGN KEY \("specialty_id"\) REFERENCES "public"\."specialty"\("id"\) ON DELETE restrict/);
    expect(text).toMatch(/"doctor_license_verification_specialty_id_specialty_id_fk"[^;]*ON DELETE restrict/);
    expect(text).toMatch(/CREATE UNIQUE INDEX "doctor_identity_verification_one_pending_uq"[^;]*WHERE status = 'pending';/);
    expect(text).toMatch(/CREATE UNIQUE INDEX "doctor_license_verification_one_pending_uq"[^;]*WHERE status = 'pending';/);
    // Las reglas de 0012 (B3) no se adelantan.
    expect(text).not.toMatch(/TRIGGER|FUNCTION/i);
  });

  it('[TC-M03-100][plan v2 §3] el journal registra 0009 a 0012 en orden y sin huecos', () => {
    const journal = JSON.parse(sqlOf(join('meta', '_journal.json'))) as { entries: { idx: number; tag: string }[] };
    const tail = journal.entries.slice(-4).map((e) => [e.idx, e.tag]);
    expect(tail).toEqual([
      [9, '0009_m03_specialty_catalog'],
      [10, '0010_m03_doctor_profile_drop_legacy'],
      [11, '0011_m03_doctor_verifications'],
      [12, '0012_m03_doctor_guards'],
    ]);
    expect(journal.entries.map((e) => e.idx)).toEqual(journal.entries.map((_, i) => i));
  });
});

const NL = String.fromCharCode(10);

describe('SQL de 0012 (M03 B3, sin aplicar)', () => {
  const s12 = () => statements('0012_m03_doctor_guards.sql');

  it('[TC-M03-101][plan v2 0012.b] empieza con el guard de funciones existentes y no toca tablas ni datos', () => {
    const all = s12();
    expect(all).toHaveLength(20); // guard + 7 funciones + 12 triggers
    expect(all[0]).toMatch(/^DO \$\$ BEGIN[\s\S]*IF EXISTS \([\s\S]*pg_proc[\s\S]*errcode = 'P0001'/);
    for (const s of all.slice(1)) expect(s).toMatch(/^(CREATE OR REPLACE FUNCTION gst_[a-z_]+\(\) RETURNS trigger LANGUAGE plpgsql|CREATE TRIGGER [a-z_]+\s+BEFORE)/);
    expect(all.join(NL)).not.toMatch(/(ALTER TABLE|DROP |CREATE TABLE|INSERT INTO|DELETE FROM|TRUNCATE [a-z"])/);
  });

  it('[TC-M03-102][D-26][R-4][D-4][D-16][R-2][C-4] crea las 7 funciones y los 12 triggers del plan', () => {
    const text = s12().join(NL);
    const functions = [...text.matchAll(/CREATE OR REPLACE FUNCTION (gst_[a-z_]+)\(/g)].map((m) => m[1]).sort(byText);
    expect(functions).toEqual([
      'gst_block_delete', 'gst_doctor_identity_review_before_insert', 'gst_doctor_identity_review_before_update',
      'gst_doctor_license_review_before_insert', 'gst_doctor_license_review_before_update', 'gst_doctor_profile_revisions',
      'gst_specialty_before_update',
    ]);
    const triggers = [...text.matchAll(/CREATE TRIGGER ([a-z_]+)\s+BEFORE (INSERT|UPDATE|DELETE|TRUNCATE)\s+ON ([a-z_]+)/g)].map((m) => `${m[3]}.${m[1]}:${m[2]}`).sort(byText);
    expect(triggers).toEqual([
      'doctor_identity_verification.doctor_identity_verification_before_insert:INSERT',
      'doctor_identity_verification.doctor_identity_verification_before_update:UPDATE',
      'doctor_identity_verification.doctor_identity_verification_no_delete:DELETE',
      'doctor_identity_verification.doctor_identity_verification_no_truncate:TRUNCATE',
      'doctor_license_verification.doctor_license_verification_before_insert:INSERT',
      'doctor_license_verification.doctor_license_verification_before_update:UPDATE',
      'doctor_license_verification.doctor_license_verification_no_delete:DELETE',
      'doctor_license_verification.doctor_license_verification_no_truncate:TRUNCATE',
      'doctor_profile.doctor_profile_revisions:UPDATE',
      'specialty.specialty_before_update:UPDATE',
      'specialty.specialty_no_delete:DELETE',
      'specialty.specialty_no_truncate:TRUNCATE',
    ]);
    // Todos los errores son P0001 (como 0005 y 0008).
    const raises = [...text.matchAll(/RAISE EXCEPTION[^;]*;/g)].map((m) => m[0]);
    expect(raises.length).toBeGreaterThan(0);
    for (const r of raises) expect(r).toMatch(/USING errcode = 'P0001';$/);
  });

  it('[TC-M03-103][plan v2 §3] 0012 es personalizada: su snapshot tiene el mismo esquema que el de 0011', () => {
    const s11 = JSON.parse(sqlOf(join('meta', '0011_snapshot.json')));
    const s12snap = JSON.parse(sqlOf(join('meta', '0012_snapshot.json')));
    expect(s12snap.prevId).toBe(s11.id);
    const { id: _a, prevId: _b, ...rest11 } = s11;
    const { id: _c, prevId: _d, ...rest12 } = s12snap;
    expect(rest12).toEqual(rest11);
  });
});

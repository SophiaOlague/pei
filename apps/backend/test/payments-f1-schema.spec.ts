// Payments F1 (0017): pruebas ESTÁTICAS, sin base de datos. Comprueban la sincronía SQL ↔ Drizzle ↔ snapshot, la
// migración registrada, el camino directo, la precisión monetaria, el inventario de triggers y la reversión literal.
// El comportamiento de constraints y triggers sobre PostgreSQL real está en
// test/integration/payments-f1.int-spec.ts (C2; no se ejecuta sin autorización).
import { readFileSync } from 'fs';
import { join } from 'path';
import { getTableName, is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../src/db/schema';

const BACKEND = join(__dirname, '..');
const MIGRATIONS = join(BACKEND, 'src', 'db', 'migrations');
const PROPOSALS = join(BACKEND, 'src', 'db', 'proposals', 'payments-f1');
const read = (p: string) => readFileSync(p, 'utf8');
const UP = read(join(PROPOSALS, '0017_payments_f1.up.sql'));
const DOWN = read(join(PROPOSALS, '0017_payments_f1.down.sql'));
const M0000 = read(join(MIGRATIONS, '0000_init.sql'));
const M0001 = read(join(MIGRATIONS, '0001_triggers.sql'));
const code = (s: string) => s.replace(/--.*$/gm, '');

const F1_TABLES = [
  'pei_fee_configuration', 'payout_schedule_configuration', 'processor_fee_schedule', 'payment', 'refund',
  'provider_webhook_event', 'idempotency_key', 'doctor_payout', 'doctor_ledger_entry', 'doctor_payout_item',
  'doctor_payout_adjustment', 'doctor_payout_adjustment_application',
] as const;
const DIRECT_PATH_TABLES = [
  'payment', 'refund', 'stripe_webhook_event', 'stripe_connect_account', 'stripe_payment_method',
  'consultation_commission_configuration', 'doctor_payout', 'doctor_payout_item', 'doctor_payout_adjustment',
  'doctor_payout_adjustment_application',
];
const MONEY_TABLES = ['payment', 'refund', 'doctor_payout', 'doctor_ledger_entry', 'doctor_payout_item', 'doctor_payout_adjustment',
  'doctor_payout_adjustment_application', 'pei_fee_configuration', 'processor_fee_schedule'];

const tables = (Object.values(schema) as unknown[]).filter((v): v is PgTable => is(v, PgTable));
const table = (name: string) => {
  const t = tables.find((x) => getTableName(x) === name);
  if (!t) throw new Error(`Drizzle no define ${name}`);
  return getTableConfig(t);
};

// Columnas de un CREATE TABLE de 0017: nombre → { tipo, not null, default }.
function sqlColumns(name: string) {
  const m = new RegExp(`create table ${name} \\(\\n([\\s\\S]*?)\\n\\);`).exec(UP);
  if (!m) throw new Error(`0017 no crea ${name}`);
  const cols = new Map<string, { type: string; notNull: boolean; hasDefault: boolean }>();
  for (const raw of m[1].split('\n')) {
    const line = raw.trim().replace(/,$/, '');
    if (!line || line.startsWith('constraint ') || line.startsWith('or ') || line.startsWith('and ') || line.startsWith('--')
      || !/^[a-z_]+ [a-z]/.test(line) || line.startsWith('(')) continue;
    const [col, ...rest] = line.split(' ');
    const def = rest.join(' ');
    const type = def.split(/ (not null|default|references|primary key)/)[0].replace('numeric(12,2)', 'numeric(12, 2)')
      .replace('numeric(7,6)', 'numeric(7, 6)').replace('timestamptz', 'timestamp with time zone');
    cols.set(col, { type, notNull: /not null|primary key/.test(def), hasDefault: /default /.test(def) });
  }
  return cols;
}

describe('Payments F1 · migración 0017 registrada', () => {
  it('la migración es idéntica a la propuesta y está en el journal como idx 17', () => {
    expect(read(join(MIGRATIONS, '0017_payments_f1.sql'))).toBe(UP);
    const journal = JSON.parse(read(join(MIGRATIONS, 'meta', '_journal.json'))) as { entries: { idx: number; tag: string; when: number }[] };
    const last = journal.entries[17];
    expect(last).toMatchObject({ idx: 17, tag: '0017_payments_f1' });
    expect(last.when).toBeGreaterThan(journal.entries[16].when);
    expect(journal.entries[16]).toMatchObject({ idx: 16, tag: '0016_m08_m1c_wait_defaults' });
  });

  it('el snapshot 0017 encadena con 0016', () => {
    const s16 = JSON.parse(read(join(MIGRATIONS, 'meta', '0016_snapshot.json'))) as { id: string };
    const s17 = JSON.parse(read(join(MIGRATIONS, 'meta', '0017_snapshot.json'))) as { id: string; prevId: string; tables: Record<string, unknown> };
    expect(s17.prevId).toBe(s16.id);
    for (const t of F1_TABLES) expect(Object.keys(s17.tables)).toContain(`public.${t}`);
    for (const t of ['stripe_connect_account', 'stripe_payment_method', 'stripe_webhook_event', 'consultation_commission_configuration']) {
      expect(Object.keys(s17.tables)).not.toContain(`public.${t}`);
    }
  });

  it('las migraciones históricas 0000–0016 no se modificaron (hashes registrados por los ejecutores)', () => {
    const { createHash } = jest.requireActual<typeof import('crypto')>('crypto');
    // Por índice del journal (sin nombrar los archivos: TC-M08-341 limita qué archivos nombran 0014).
    const journal = JSON.parse(read(join(MIGRATIONS, 'meta', '_journal.json'))) as { entries: { idx: number; tag: string }[] };
    const sha = (idx: number) => createHash('sha256').update(readFileSync(join(MIGRATIONS, `${journal.entries[idx].tag}.sql`))).digest('hex');
    expect(sha(16)).toBe('fd9f6f77a778e010a064bd45644f5754faf6b6221387cdcef35e7060aa584936');
    expect(sha(15)).toBe('7652c22e8ea4598ca290338ad030fec40170da46c985591bdc85874d7909ef8d');
    expect(sha(14)).toBe('72af287cf7336d6f56942b35576b89c9cf0e1e3566b42f41ab62145ab440e24c');
    expect(sha(13)).toBe('2138d4064d8acd97e3189c38eace19e79fbf622b97ed53ecf772c205846b1472');
  });

  it('0018 es la entrada 18 del journal, su snapshot encadena con 0017 y solo agrega stripe al enum de proveedores', () => {
    const journal = JSON.parse(read(join(MIGRATIONS, 'meta', '_journal.json'))) as { entries: { idx: number; tag: string; when: number }[] };
    expect(journal.entries[18]).toMatchObject({ idx: 18, tag: '0018_payments_stripe_provider' });
    expect(journal.entries[18].when).toBeGreaterThan(journal.entries[17].when);
    // 0019 (videoconsulta) va después: aquí solo importa que 0018 siga siendo la entrada 18.
    expect(journal.entries.length).toBeGreaterThanOrEqual(19);
    type Snapshot = { id: string; prevId: string; enums: Record<string, { values: string[] }> } & Record<string, unknown>;
    const s17 = JSON.parse(read(join(MIGRATIONS, 'meta', '0017_snapshot.json'))) as Snapshot;
    const s18 = JSON.parse(read(join(MIGRATIONS, 'meta', '0018_snapshot.json'))) as Snapshot;
    expect(s18.prevId).toBe(s17.id);
    expect(s17.enums['public.payment_provider_enum'].values).toEqual(['mercado_pago']);
    expect(s18.enums['public.payment_provider_enum'].values).toEqual(['mercado_pago', 'stripe']);
    expect(schema.paymentProviderEnum.enumValues).toEqual(['mercado_pago', 'stripe']);
    // Fuera de ese valor (y de los ids), los dos snapshots son idénticos: 0018 no cambia ninguna estructura.
    const normalize = (s: Snapshot) => {
      const enums = { ...s.enums, 'public.payment_provider_enum': { ...s.enums['public.payment_provider_enum'], values: [] } };
      return JSON.stringify({ ...s, id: null, prevId: null, enums });
    };
    expect(normalize(s18)).toBe(normalize(s17));
    // 0017 no se modificó.
    const { createHash } = jest.requireActual<typeof import('crypto')>('crypto');
    expect(createHash('sha256').update(readFileSync(join(MIGRATIONS, '0017_payments_f1.sql'))).digest('hex')).toBe('5593858840293a7d46866dbd37ada7345c5616cda84db1c566a37b8f840944b1');
  });

  it('usa LF (el hash de Drizzle se calcula sobre los bytes)', () => {
    expect(UP.includes('\r')).toBe(false);
    expect(DOWN.includes('\r')).toBe(false);
  });
});

describe('Payments F1 · camino directo y fallo seguro', () => {
  const guard = /do \$\$[\s\S]*?end \$\$;/.exec(UP)![0];

  it('antes de cualquier DDL comprueba 0013, 0016, que no esté aplicada y que las diez tablas estén vacías', () => {
    expect(UP.indexOf(guard)).toBeLessThan(UP.indexOf('drop table'));
    for (const t of DIRECT_PATH_TABLES) expect(guard).toContain(`'${t}'`);
    expect(guard).toMatch(/count\(\*\)/);
    expect(guard).toMatch(/solo implementa el camino directo/);
    expect(guard).toMatch(/requiere 0013/);
    expect(guard).toMatch(/requiere 0016/);
    expect(guard).toMatch(/ya está aplicada/);
  });

  it('no inserta, actualiza, borra ni trunca datos (fuera de los cuerpos de los triggers)', () => {
    const outsideFunctions = code(UP).replace(/\$\$[\s\S]*?\$\$/g, '');
    expect(outsideFunctions).not.toMatch(/\binsert\s+into\b|\bdelete\s+from\b|\bupdate\s+\w+\s+set\b|(?<!before )\btruncate\s+(table\s+)?\w/i);
    expect(outsideFunctions).not.toMatch(/\bcascade\b/i);
  });

  it('no siembra una comisión ni una tarifa comercial (PAY-06, PAY-08)', () => {
    expect(code(UP)).not.toMatch(/insert into (pei_fee_configuration|processor_fee_schedule|payout_schedule_configuration)/i);
    expect(table('pei_fee_configuration').columns.find((c) => c.name === 'fixed_fee')!.hasDefault).toBe(false);
    expect(table('processor_fee_schedule').columns.filter((c) => c.hasDefault).map((c) => c.name).sort()).toEqual(['created_at', 'currency', 'id']);
  });

  it('no toca appointment.price ni consultation_price_configuration.price, ni objetos de M08', () => {
    expect(code(UP)).not.toMatch(/alter table (appointment|consultation_price_configuration|cancellation_policy)\b/);
    expect(table('appointment').columns.find((c) => c.name === 'price')!.getSQLType()).toBe('numeric(10, 2)');
    expect(table('consultation_price_configuration').columns.find((c) => c.name === 'price')!.getSQLType()).toBe('numeric(10, 2)');
  });
});

describe('Payments F1 · sincronía SQL ↔ Drizzle', () => {
  it.each(F1_TABLES)('%s: mismas columnas, tipos, nulabilidad y valores por defecto', (name) => {
    const sqlCols = sqlColumns(name);
    const drizzle = new Map(table(name).columns.map((c) => [c.name, { type: c.getSQLType(), notNull: c.notNull, hasDefault: c.hasDefault }]));
    expect([...drizzle.keys()].sort()).toEqual([...sqlCols.keys()].sort());
    for (const [col, d] of drizzle) {
      const s = sqlCols.get(col)!;
      expect({ col, type: d.type, notNull: d.notNull, hasDefault: d.hasDefault }).toEqual({
        col, type: s.type.replace(/^payment_[a-z_]+_enum$|^[a-z_]+_enum$/, d.type), notNull: s.notNull, hasDefault: s.hasDefault,
      });
    }
  });

  it.each(F1_TABLES)('%s: cada CHECK, UNIQUE e índice de Drizzle existe con el mismo nombre en 0017', (name) => {
    const cfg = table(name);
    const names = [...cfg.checks.map((c) => c.name), ...cfg.uniqueConstraints.map((u) => u.getName()), ...cfg.indexes.map((i) => i.config.name)];
    for (const n of names) expect({ name, constraint: n, inSql: new RegExp(`\\b${n}\\b`).test(UP) }).toEqual({ name, constraint: n, inSql: true });
  });

  it('Drizzle no define estructuras de Stripe', () => {
    const names = tables.map((t) => getTableName(t));
    expect(names.filter((n) => n.startsWith('stripe_') || n === 'consultation_commission_configuration')).toEqual([]);
    for (const t of tables) for (const c of getTableConfig(t).columns) expect(c.name).not.toMatch(/stripe/);
  });

  it('las claves de 0017 coinciden con el diseño (C-4, I-2, I-10)', () => {
    const adj = table('doctor_payout_adjustment').columns;
    expect(adj.find((c) => c.name === 'source_payout_id')!.notNull).toBe(false);
    expect(adj.find((c) => c.name === 'ledger_entry_id')!.notNull).toBe(true);
    const item = table('doctor_payout_item').columns;
    expect(item.find((c) => c.name === 'ledger_entry_id')!.notNull).toBe(true);
    expect(item.find((c) => c.name === 'revocation_ledger_entry_id')!.notNull).toBe(false);
    const ledger = table('doctor_ledger_entry');
    for (const c of ['entry_type', 'source_type', 'source_ref', 'payment_id', 'doctor_id', 'amount']) {
      expect(ledger.columns.find((x) => x.name === c)!.notNull).toBe(true);
    }
    expect(UP).toMatch(/constraint doctor_ledger_entry_key_uq unique \(entry_type, source_type, source_ref\)/);
    expect(UP).toMatch(/doctor_ledger_entry_earning_uq on doctor_ledger_entry \(payment_id\) where entry_type = 'consultation_earning'/);
    expect(UP).toMatch(/doctor_ledger_entry_reverses_uq on doctor_ledger_entry \(reverses_entry_id\) where reverses_entry_id is not null/);
    expect(UP).toMatch(/payment_active_appointment_uq on payment \(appointment_id\)\n  where type = 'consultation' and status not in \('failed', 'canceled'\)/);
    expect(UP).toMatch(/doctor_payout_adjustment_type_f1_chk check \(type in \('refund_reversal', 'chargeback'\)\)/);
  });
});

describe('Payments F1 · precisión monetaria (PAY-13)', () => {
  it('todos los importes de las tablas financieras son numeric(12,2)', () => {
    for (const name of MONEY_TABLES) {
      for (const c of table(name).columns) {
        if (c.getSQLType().startsWith('numeric') && !c.name.endsWith('rate')) expect({ name, col: c.name, type: c.getSQLType() }).toEqual({ name, col: c.name, type: 'numeric(12, 2)' });
      }
    }
  });

  it('las variables locales de los triggers de 0017 son numeric(12,2)', () => {
    const decls = [...UP.matchAll(/\bv_[a-z_]+ numeric(\([0-9, ]+\))?;/g)].map((m) => m[0]);
    expect(decls.length).toBeGreaterThan(0);
    for (const d of decls) expect(d).toMatch(/numeric\(12,2\);$/);
  });
});

describe('Payments F1 · inventario de triggers', () => {
  const triggers = [...code(UP).matchAll(/create (?:constraint )?trigger (\w+)[\s\S]*?on (\w+)/g)].map((m) => `${m[2]}.${m[1]}`);

  it.each([
    'payment.payment_guard', 'payment.payment_no_delete', 'payment.payment_no_truncate',
    'refund.refund_within_payment', 'refund.refund_guard', 'refund.refund_no_delete', 'refund.refund_no_truncate',
    'provider_webhook_event.provider_webhook_event_guard', 'provider_webhook_event.provider_webhook_event_no_delete',
    'idempotency_key.idempotency_key_guard', 'idempotency_key.idempotency_key_no_delete',
    'doctor_payout.payout_immutable_after_transfer', 'doctor_payout.payout_paid_requires_adjustments', 'doctor_payout.doctor_payout_no_truncate',
    'doctor_ledger_entry.ledger_entry_insert', 'doctor_ledger_entry.ledger_entry_append_only', 'doctor_ledger_entry.ledger_entry_no_truncate',
    'doctor_ledger_entry.ledger_entry_has_unit',
    'doctor_payout_item.payout_item_insert', 'doctor_payout_item.payout_item_update', 'doctor_payout_item.payout_item_no_delete',
    'doctor_payout_item.payout_item_totals', 'doctor_payout_adjustment.adjustment_insert', 'doctor_payout_adjustment.adjustment_append_only',
    'doctor_payout_adjustment_application.adjustment_application_insert', 'doctor_payout_adjustment_application.adjustment_application_totals',
    'doctor_payout_adjustment_application.adjustment_application_append_only',
    'pei_fee_configuration.pei_fee_configuration_versioned', 'payout_schedule_configuration.payout_schedule_configuration_versioned',
    'processor_fee_schedule.processor_fee_schedule_versioned', 'processor_fee_schedule.processor_fee_schedule_no_overlap',
  ])('%s', (t) => expect(triggers).toContain(t));

  it('ledger_entry_has_unit es un constraint trigger diferido (I-2 al confirmar)', () => {
    expect(UP).toMatch(/create constraint trigger ledger_entry_has_unit\n  after insert on doctor_ledger_entry\n  deferrable initially deferred/);
  });

  it('las configuraciones versionadas usan las guardas de 0013 y una exclusión de solapamiento', () => {
    expect(UP).toMatch(/pei_fee_configuration_no_overlap exclude using gist/);
    expect(UP).toMatch(/payout_schedule_configuration_no_overlap exclude using gist/);
    expect(UP.match(/execute function gst_versioned_config_guard\(\)/g)).toHaveLength(3);
  });
});

describe('Payments F1 · reversión', () => {
  it('solo procede con todas las tablas de 0017 vacías y no borra datos', () => {
    const guard = /do \$\$[\s\S]*?end \$\$;/.exec(DOWN)![0];
    for (const t of F1_TABLES) expect(guard).toContain(`'${t}'`);
    expect(guard).toMatch(/no borra datos/);
    expect(code(DOWN).replace(/\$\$[\s\S]*?\$\$/g, '')).not.toMatch(/\bdelete\s+from\b|\btruncate\b|\bcascade\b/i);
  });

  it('restaura literalmente las definiciones de 0000 y las secciones 6 a 8 de 0001', () => {
    for (const t of ['payment', 'refund', 'stripe_connect_account', 'stripe_payment_method', 'stripe_webhook_event',
      'consultation_commission_configuration', 'doctor_payout', 'doctor_payout_adjustment', 'doctor_payout_adjustment_application', 'doctor_payout_item']) {
      const ddl = new RegExp(`CREATE TABLE "${t}" \\([\\s\\S]*?\\n\\);`).exec(M0000)![0];
      expect(DOWN).toContain(ddl.replace(/;$/, ''));
    }
    const lines = M0001.split('\n');
    const start = lines.findIndex((l) => l.startsWith('-- 6. Reembolsos')) - 1;
    const end = lines.findIndex((l) => l.startsWith('-- 9. Configuraciones versionadas')) - 1;
    expect(DOWN).toContain(lines.slice(start, end).join('\n').trimEnd());
    expect(DOWN).toMatch(/add constraint commission_configuration_no_overlap/);
  });
});

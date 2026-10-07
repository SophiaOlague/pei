// Aplicada el 2026-10-07 en la BD de desarrollo; no volver a ejecutar salvo necesidad explícita.
//
// DT-22 (opción A): corrección puntual de CURP de DESARROLLO que no cumplen el formato aprobado,
// para poder agregar el CHECK de 0004_m02_identity. No forma parte de las migraciones versionadas.
//
// Solo corrige filas cuyo ÚNICO problema es el segundo carácter (debe ser vocal o X): lo reemplaza por la
// primera vocal que deja la CURP con formato válido y sin duplicar otra, y recalcula el dígito verificador.
// Cualquier otra fila inválida se reporta y no se toca.
//
// Nunca imprime valores de CURP ni identificadores de personas: solo conteos.
//
//   node scripts/dev-fix-curp-dt22.mjs                        → solo lectura: muestra qué haría
//   node scripts/dev-fix-curp-dt22.mjs --apply --confirm-dev  → aplica la corrección (requiere autorización)
import 'dotenv/config';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const CURP_PATTERN =
  '^[A-Z][AEIOUX][A-Z]{2}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[HMX]' +
  '(AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)' +
  '[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9][0-9]$';
const pattern = new RegExp(CURP_PATTERN);
const DICTIONARY = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

function checkDigit(first17) {
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += DICTIONARY.indexOf(first17[i]) * (18 - i);
  return String((10 - (sum % 10)) % 10);
}

const apply = process.argv.includes('--apply');
if (apply && !process.argv.includes('--confirm-dev')) {
  console.error('--apply requiere --confirm-dev: esta corrección es solo para la BD de desarrollo.');
  process.exit(2);
}

if (process.env.NODE_ENV === 'production') {
  console.error('Este script solo se ejecuta contra la BD de desarrollo (NODE_ENV=production rechazado).');
  process.exit(2);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
let exitCode = 0;
try {
  await client.query(apply ? 'begin' : 'begin read only');
  const { rows } = await client.query(
    `select id, curp from patient_profile where curp is null or curp !~ $1${apply ? ' for update' : ''}`,
    [CURP_PATTERN],
  );
  const taken = new Set((await client.query('select curp from patient_profile where curp is not null')).rows.map((r) => r.curp));

  const fixes = [];
  let notFixable = 0;
  for (const row of rows) {
    const curp = row.curp ?? '';
    const candidate = ['A', 'E', 'I', 'O', 'U', 'X']
      .map((vowel) => {
        const first17 = curp.slice(0, 1) + vowel + curp.slice(2, 17);
        return first17 + checkDigit(first17);
      })
      .find((value) => curp.length === 18 && pattern.test(value) && !taken.has(value));
    if (candidate) {
      fixes.push({ id: row.id, curp: candidate });
      taken.add(candidate);
    } else {
      notFixable++;
    }
  }

  console.log(`filas que incumplen el formato: ${rows.length}`);
  console.log(`corregibles cambiando solo el 2.º carácter (y el dígito verificador): ${fixes.length}`);
  console.log(`no corregibles por este script: ${notFixable}`);

  if (!apply) {
    console.log('modo solo lectura: no se modificó nada (usa --apply --confirm-dev con autorización).');
    await client.query('rollback');
  } else if (notFixable > 0) {
    console.error('hay filas que este script no corrige: no se aplicó ningún cambio.');
    await client.query('rollback');
    exitCode = 1;
  } else {
    for (const fix of fixes) {
      const { rowCount } = await client.query('update patient_profile set curp = $1, updated_at = now() where id = $2', [fix.curp, fix.id]);
      if (rowCount !== 1) throw new Error('la corrección afectaría un número inesperado de filas');
    }
    const { rows: after } = await client.query('select count(*)::int as n from patient_profile where curp is null or curp !~ $1', [
      CURP_PATTERN,
    ]);
    if (after[0].n !== 0) throw new Error('después de la corrección aún hay CURP que incumplen el formato');
    await client.query('commit');
    console.log(`corregidas: ${fixes.length}; filas que incumplen el formato después: 0`);
  }
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error(`error: ${error?.code ?? ''} ${error?.message ?? error}`);
  exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
process.exit(exitCode);

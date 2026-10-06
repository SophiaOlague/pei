// Ejecuta las suites de pruebas y guarda la evidencia de la corrida en
// docs/testing/ejecuciones/<fecha>_<commit>_<etiqueta>/:
//   - unit.json, integration.json, e2e.json: salida --json de Jest, con rutas relativas a apps/backend
//   - resumen.md: ambiente, totales y resultado por caso de prueba y por requisito
//
// Los resultados salen solo de la salida de Jest. Un caso omitido o una suite que no pudo
// ejecutarse se reporta como NO EJECUTADA.
//
// Uso: pnpm test:evidence -- M00

import { spawnSync, execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import os from 'node:os';

const backendDir = resolve(import.meta.dirname, '..');
const repoDir = resolve(backendDir, '..', '..');
const label = process.argv[2] ?? 'corrida';

const SUITES = [
  { name: 'unit', title: 'Unitarias', args: [] },
  { name: 'integration', title: 'Integración (BD de desarrollo, rollback)', args: ['--config', './test/jest-integration.json', '--runInBand'] },
  { name: 'e2e', title: 'E2E / API', args: ['--config', './test/jest-e2e.json', '--runInBand'] },
];

const git = (cmd) => execSync(`git ${cmd}`, { cwd: repoDir, encoding: 'utf8' }).trim();
const commit = git('rev-parse --short HEAD');
const dirty = git('status --porcelain').length > 0;
const startedAt = new Date();
const stamp = startedAt.toISOString().slice(0, 19).replace(/:/g, '-');
const runId = `${stamp}_${commit}${dirty ? '-dirty' : ''}_${label}`;
const outDir = join(repoDir, 'docs', 'testing', 'ejecuciones', runId);
mkdirSync(outDir, { recursive: true });

// Solo el tipo de BD y si es Neon; nunca credenciales ni el host completo.
function describeDatabase() {
  const envFile = join(backendDir, '.env');
  const source = process.env.DATABASE_URL ?? (existsSync(envFile) ? readFileSync(envFile, 'utf8') : '');
  const match = source.match(/postgres(?:ql)?:\/\/[^@\s]+@([^/\s:?]+)/);
  if (!match) return 'no configurada';
  return match[1].endsWith('.neon.tech') ? 'PostgreSQL en Neon (BD de desarrollo; host omitido)' : 'PostgreSQL (host omitido)';
}

const STATUS = { passed: 'PASS', failed: 'FAIL' };
const toStatus = (jestStatus) => STATUS[jestStatus] ?? 'NO EJECUTADA';
const TAG = /\[([A-Z]+(?:-[A-Z0-9]+)+)\]/g;

const cases = [];
const suiteSummaries = [];

for (const suite of SUITES) {
  const jsonFile = join(outDir, `${suite.name}.json`);
  const run = spawnSync(
    process.execPath,
    ['--experimental-vm-modules', './node_modules/jest/bin/jest.js', '--ci', '--json', '--outputFile', jsonFile, ...suite.args],
    { cwd: backendDir, encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } },
  );

  if (!existsSync(jsonFile)) {
    suiteSummaries.push({ ...suite, error: (run.stderr || run.stdout || 'sin salida').slice(-2000) });
    continue;
  }

  const report = JSON.parse(readFileSync(jsonFile, 'utf8'));
  suiteSummaries.push({
    ...suite,
    total: report.numTotalTests,
    passed: report.numPassedTests,
    failed: report.numFailedTests,
    notRun: report.numPendingTests + report.numTodoTests,
    failedSuites: report.testResults.filter((r) => r.status === 'failed' && r.assertionResults.length === 0).map((r) => ({
      file: relative(backendDir, r.name).replace(/\\/g, '/'),
      message: r.message,
    })),
  });

  for (const file of report.testResults) {
    for (const assertion of file.assertionResults) {
      const tags = [...assertion.title.matchAll(TAG)].map((m) => m[1]);
      cases.push({
        suite: suite.name,
        file: relative(backendDir, file.name).replace(/\\/g, '/'),
        title: assertion.fullName,
        testCase: tags.find((t) => t.startsWith('TC-')) ?? '(sin TC: prueba previa a M00)',
        requirements: tags.filter((t) => !t.startsWith('TC-')),
        status: toStatus(assertion.status),
        durationMs: assertion.duration ?? null,
      });
    }
  }

  // La evidencia no debe depender de la máquina: las rutas absolutas se reescriben como relativas a apps/backend.
  writeFileSync(jsonFile, JSON.stringify(relativizePaths(report), null, 2), 'utf8');
}

function relativizePaths(value) {
  if (typeof value === 'string') {
    return value.split(backendDir).join('.').split(backendDir.replace(/\\/g, '/')).join('.');
  }
  if (Array.isArray(value)) return value.map(relativizePaths);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, relativizePaths(item)]));
  }
  return value;
}

const finishedAt = new Date();
const worst = (statuses) => (statuses.includes('FAIL') ? 'FAIL' : statuses.includes('NO EJECUTADA') ? 'NO EJECUTADA' : 'PASS');

// Agrupa por caso de prueba (un TC con it.each tiene varias ejecuciones).
const byTestCase = new Map();
for (const c of cases) {
  const entry = byTestCase.get(c.testCase) ?? { requirements: new Set(), files: new Set(), statuses: [] };
  c.requirements.forEach((r) => entry.requirements.add(r));
  entry.files.add(c.file);
  entry.statuses.push(c.status);
  byTestCase.set(c.testCase, entry);
}

const byRequirement = new Map();
for (const c of cases) {
  for (const requirement of c.requirements) {
    const entry = byRequirement.get(requirement) ?? { testCases: new Set(), statuses: [] };
    entry.testCases.add(c.testCase);
    entry.statuses.push(c.status);
    byRequirement.set(requirement, entry);
  }
}

const sortIds = (a, b) => a.localeCompare(b, 'es', { numeric: true });
const lines = [];
lines.push(`# Ejecución de pruebas ${runId}`, '');
lines.push('| Campo | Valor |', '|---|---|');
lines.push(`| Inicio | ${startedAt.toISOString()} |`);
lines.push(`| Fin | ${finishedAt.toISOString()} |`);
lines.push(`| Commit | ${commit}${dirty ? ' + cambios sin commit en el árbol de trabajo' : ''} |`);
lines.push(`| Etiqueta | ${label} |`);
lines.push(`| Node.js | ${process.version} |`);
lines.push(`| Sistema operativo | ${os.type()} ${os.release()} (${os.arch()}) |`);
lines.push(`| Base de datos | ${describeDatabase()} |`);
lines.push('', '## Totales por suite', '');
lines.push('| Suite | Total | PASS | FAIL | NO EJECUTADA |', '|---|---|---|---|---|');
for (const s of suiteSummaries) {
  if (s.error) lines.push(`| ${s.title} | — | — | — | NO EJECUTADA (la suite no produjo reporte) |`);
  else lines.push(`| ${s.title} | ${s.total} | ${s.passed} | ${s.failed} | ${s.notRun} |`);
}
for (const s of suiteSummaries) {
  if (s.error) lines.push('', `### ${s.title}: error de ejecución`, '', '```', s.error, '```');
  for (const f of s.failedSuites ?? []) lines.push('', `### ${f.file}: la suite no pudo ejecutarse`, '', '```', f.message, '```');
}
lines.push('', '## Resultado por requisito', '');
lines.push('| Requisito | Casos de prueba | Resultado |', '|---|---|---|');
for (const [requirement, entry] of [...byRequirement].sort(([a], [b]) => sortIds(a, b))) {
  lines.push(`| ${requirement} | ${[...entry.testCases].sort(sortIds).join(', ')} | ${worst(entry.statuses)} |`);
}
lines.push('', '## Resultado por caso de prueba', '');
lines.push('| Caso | Requisitos | Script | Ejecuciones | Resultado |', '|---|---|---|---|---|');
for (const [testCase, entry] of [...byTestCase].sort(([a], [b]) => sortIds(a, b))) {
  const counts = `${entry.statuses.filter((s) => s === 'PASS').length}/${entry.statuses.length} PASS`;
  lines.push(
    `| ${testCase} | ${[...entry.requirements].sort(sortIds).join(', ') || '—'} | ${[...entry.files].join('<br>')} | ${counts} | ${worst(entry.statuses)} |`,
  );
}
lines.push('', '## Detalle', '');
lines.push('| Suite | Prueba | Resultado | ms |', '|---|---|---|---|');
for (const c of cases) lines.push(`| ${c.suite} | ${c.title.replace(/\|/g, '\\|')} | ${c.status} | ${c.durationMs ?? '—'} |`);

writeFileSync(join(outDir, 'resumen.md'), lines.join('\n') + '\n', 'utf8');

const failed = suiteSummaries.some((s) => s.error || s.failed > 0 || (s.failedSuites ?? []).length > 0);
console.log(`Evidencia guardada en ${relative(repoDir, outDir)}`);
for (const s of suiteSummaries) {
  console.log(s.error ? `${s.title}: NO EJECUTADA` : `${s.title}: ${s.passed}/${s.total} PASS, ${s.failed} FAIL, ${s.notRun} NO EJECUTADA`);
}
process.exit(failed ? 1 : 0);

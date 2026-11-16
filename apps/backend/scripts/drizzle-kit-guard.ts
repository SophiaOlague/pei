// R-1: drizzle-kit no aplica migraciones en este proyecto. `migrate` y `push` usarían el DATABASE_URL del .env sin
// ninguna salvaguarda de destino; las migraciones se aplican solo con los ejecutores controlados.
// drizzle.config.ts llama a esta función al cargarse, así que también bloquea `npx drizzle-kit migrate`.
export const BLOCKED_DRIZZLE_KIT_COMMANDS = ['migrate', 'push'] as const;

export const MIGRATE_INSTRUCTIONS = [
  'drizzle-kit migrate/push está deshabilitado en PEI: no tiene salvaguarda de destino.',
  'Use un ejecutor controlado (verifica la identidad del destino y aplica solo la siguiente migración autorizada):',
  '  C2:          npx ts-node --transpile-only scripts/c2-migrate.ts [--apply]',
  '  desarrollo:  npx ts-node --transpile-only scripts/dev-migrate.ts [--apply]',
  'Cada aplicación requiere autorización expresa.',
].join('\n');

// El comando de drizzle-kit es el primer argumento que no es una opción: `drizzle-kit migrate --config x` → migrate.
export function drizzleKitCommand(argv: readonly string[]): string | undefined {
  return argv.slice(2).find((a) => !a.startsWith('-'));
}

// Falla cerrado: basta con que CUALQUIER argumento sea migrate o push (también tras opciones con valor, como
// `--config x migrate`). Un falso positivo (p. ej. `generate --name migrate`) solo impide ese comando.
export function assertDrizzleKitCommandAllowed(argv: readonly string[] = process.argv): void {
  const args = argv.slice(2);
  if (args.some((a) => (BLOCKED_DRIZZLE_KIT_COMMANDS as readonly string[]).includes(a))) {
    throw new Error(MIGRATE_INSTRUCTIONS);
  }
}

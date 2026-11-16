// M08 (AP-1, AP-11, AP-22): carga inicial del precio global (200.00 MXN) y de la primera versión de la política de citas.
// Lógica del CLI sin efectos propios; el contexto de Nest y la BD se inyectan (appointments-config-seed.ts).
//
//   pnpm appointments:seed-config --created-by <userProfileId> [--target-branch <branchId> --apply [--confirm-main-db]]
//
// - Por omisión es una SIMULACIÓN: muestra el destino real y lo que haría, sin escribir nada.
// - Escribe solo con --apply, y entonces exige --target-branch con un destino de SEED_TARGETS. Hoy el único destino
//   autorizado es la base de desarrollo, que exige además --confirm-main-db. C2, los respaldos y cualquier rama
//   desconocida se rechazan. El proyecto Neon de producción definitivo aún no existe: no hay destino de producción.
// - La identidad REAL de la conexión (neon.project_id, neon.branch_id, neon.endpoint_id) debe coincidir con el destino
//   declarado. Se comprueba al inicio y otra vez DENTRO de la transacción que escribe, justo antes de la primera
//   escritura: la comprobación, la validación del administrador, la idempotencia y las escrituras (versiones y
//   auditoría) ocurren en esa misma transacción.
// - Es idempotente: no crea nada si ya existe una versión de precio o de política.
// - created_by debe ser un user_profile con rol admin existente.
// Ejecutarlo en cualquier base requiere una autorización expresa (AP-11): todavía no se ha ejecutado.
import { INITIAL_CONSULTATION_PRICE, CONSULTATION_CURRENCY } from '../modules/appointments/domain/consultation-price';
import { INITIAL_POLICY } from '../modules/appointments/domain/cancellation-policy';

export const EXIT_OK = 0;
export const EXIT_ABORTED = 1;
export const EXIT_USAGE = 2;
export const EXIT_UNEXPECTED = 3;

export type SeedTargetKind = 'development';
export interface SeedTarget { kind: SeedTargetKind; label: string; project: string; branch: string; endpoint: string }

// Destinos autorizados para escribir. Solo desarrollo. Añadir uno (por ejemplo, la producción futura con su propia
// bandera de confirmación) exige una revisión explícita.
export const SEED_TARGETS: Readonly<Record<string, SeedTarget>> = Object.freeze({
  'br-royal-recipe-b54s5hnn': Object.freeze({
    kind: 'development', label: 'DESARROLLO', project: 'royal-paper-10258990', branch: 'br-royal-recipe-b54s5hnn', endpoint: 'ep-wandering-bonus-b5kxacor',
  }),
});
export const MAIN_DEV_BRANCH_ID = 'br-royal-recipe-b54s5hnn';

// Ramas conocidas que NUNCA son destino de esta carga, aunque coincidan con la identidad real.
export const FORBIDDEN_TARGETS: Readonly<Record<string, string>> = Object.freeze({
  'br-shy-pond-b50a3m8f': 'C2 (pruebas)',
  'br-silent-butterfly-b5z128fu': 'respaldo c2-pre-0013',
  'br-rapid-water-b5za50z4': 'respaldo de desarrollo previo a 0013',
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USAGE = 'Uso: pnpm appointments:seed-config --created-by <userProfileId> [--target-branch <branchId> --apply [--confirm-main-db]]';

export interface SeedArgs {
  createdBy: string;
  apply: boolean;
  confirmMainDb: boolean;
  targetBranch: string | null;
}

// null = uso inválido: bandera desconocida, valor ausente o vacío, bandera repetida o --apply sin --target-branch.
export function parseSeedArgs(argv: string[]): SeedArgs | null {
  let createdBy: string | null = null;
  let targetBranch: string | null = null;
  let apply = false;
  let confirmMainDb = false;
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (seen.has(a)) return null;
    seen.add(a);
    if (a === '--created-by') createdBy = argv[++i] ?? null;
    else if (a === '--target-branch') {
      const value = argv[++i];
      if (!value || !value.trim() || value.startsWith('--')) return null;
      targetBranch = value;
    } else if (a === '--apply') apply = true;
    else if (a === '--confirm-main-db') confirmMainDb = true;
    else return null;
  }
  if (!createdBy || !UUID.test(createdBy)) return null;
  if (apply && !targetBranch) return null;
  return { createdBy, apply, confirmMainDb, targetBranch };
}

export interface NeonIdentity { project: string | null; branch: string | null; endpoint: string | null }

export class SeedTargetRejected extends Error {}

// Decide si se puede escribir en el destino declarado con la identidad real dada. Falla de forma cerrada.
export function authorizeSeedTarget(targetBranch: string | null, identity: NeonIdentity | null, confirmMainDb: boolean): SeedTarget {
  if (!targetBranch) throw new SeedTargetRejected('falta --target-branch');
  const forbidden = FORBIDDEN_TARGETS[targetBranch];
  if (forbidden) throw new SeedTargetRejected(`--target-branch es ${forbidden}: no es un destino de la carga inicial`);
  const target = Object.prototype.hasOwnProperty.call(SEED_TARGETS, targetBranch) ? SEED_TARGETS[targetBranch] : undefined;
  if (!target) throw new SeedTargetRejected('--target-branch no es un destino autorizado');
  if (!identity || !identity.project || !identity.branch || !identity.endpoint) throw new SeedTargetRejected('la conexión no expone la identidad de Neon (neon.*)');
  const actualForbidden = FORBIDDEN_TARGETS[identity.branch];
  if (actualForbidden) throw new SeedTargetRejected(`la conexión real es ${actualForbidden}`);
  if (identity.project !== target.project) throw new SeedTargetRejected('el proyecto real no coincide con el destino declarado');
  if (identity.branch !== target.branch) throw new SeedTargetRejected('la rama real no coincide con --target-branch');
  if (identity.endpoint !== target.endpoint) throw new SeedTargetRejected('el endpoint real no coincide con el destino declarado');
  if (target.kind === 'development' && !confirmMainDb) {
    throw new SeedTargetRejected('el destino es la base de desarrollo; se requiere --confirm-main-db y una autorización expresa');
  }
  return target;
}

export interface SeedContext {
  // Identidad real de la conexión activa (dentro de inTransaction, la de esa transacción).
  identity(): Promise<NeonIdentity | null>;
  // Ejecuta `work` en UNA transacción: todas las lecturas y escrituras del contexto llamadas dentro la usan.
  inTransaction<T>(work: () => Promise<T>): Promise<T>;
  isAdmin(userProfileId: string): Promise<{ userId: string } | null>;
  hasPriceVersion(): Promise<boolean>;
  hasPolicyVersion(): Promise<boolean>;
  publishPrice(admin: { userId: string; userProfileId: string }): Promise<void>;
  publishPolicy(admin: { userId: string; userProfileId: string }): Promise<void>;
}

const describeIdentity = (i: NeonIdentity | null) => `proyecto ${i?.project ?? 'desconocido'}, rama ${i?.branch ?? 'desconocida'}, endpoint ${i?.endpoint ?? 'desconocido'}`;

class SeedAborted extends Error {}

export async function runAppointmentsConfigSeed(argv: string[], ctx: SeedContext, log: (l: string) => void, error: (l: string) => void): Promise<number> {
  const args = parseSeedArgs(argv);
  if (!args) {
    error(USAGE);
    return EXIT_USAGE;
  }
  try {
    const identity = await ctx.identity();
    const known = identity?.branch ? SEED_TARGETS[identity.branch]?.label ?? FORBIDDEN_TARGETS[identity.branch] : undefined;
    log(`Destino real: ${describeIdentity(identity)}${known ? ` (${known})` : ''}`);
    if (args.apply) authorizeSeedTarget(args.targetBranch, identity, args.confirmMainDb);

    const plan = async () => {
      const admin = await ctx.isAdmin(args.createdBy);
      if (!admin) throw new SeedAborted('--created-by no corresponde a un administrador existente');
      const needPrice = !(await ctx.hasPriceVersion());
      const needPolicy = !(await ctx.hasPolicyVersion());
      const items: string[] = [];
      if (needPrice) items.push(`precio global ${INITIAL_CONSULTATION_PRICE} ${CONSULTATION_CURRENCY}`);
      if (needPolicy) items.push(`política: plazo ${INITIAL_POLICY.refundDeadlineHours} h, ${INITIAL_POLICY.maxReschedules} reagendamientos, ventana del médico ${INITIAL_POLICY.doctorWaitMinutes} min, tolerancia ${INITIAL_POLICY.patientToleranceMinutes} min`);
      return { admin, needPrice, needPolicy, items };
    };

    if (!args.apply) {
      const p = await plan();
      log(p.items.length === 0 ? 'Nada que hacer: ya existen versiones de precio y de política' : `SIMULACIÓN (sin --apply, no se escribe nada). Se crearía: ${p.items.join('; ')}`);
      return EXIT_OK;
    }

    const created = await ctx.inTransaction(async () => {
      // Identidad otra vez, en la MISMA transacción que escribe y antes de la primera escritura.
      authorizeSeedTarget(args.targetBranch, await ctx.identity(), args.confirmMainDb);
      const p = await plan();
      if (p.items.length === 0) return p.items;
      const actor = { userId: p.admin.userId, userProfileId: args.createdBy };
      if (p.needPrice) await ctx.publishPrice(actor);
      if (p.needPolicy) await ctx.publishPolicy(actor);
      return p.items;
    });
    log(created.length === 0 ? 'Nada que hacer: ya existen versiones de precio y de política' : `Creado: ${created.join('; ')}`);
    return EXIT_OK;
  } catch (e) {
    if (e instanceof SeedTargetRejected || e instanceof SeedAborted) {
      error(`Abortado: ${e.message}`);
      return EXIT_ABORTED;
    }
    error(`Fallo inesperado: ${e instanceof Error ? e.message : String(e)}`);
    return EXIT_UNEXPECTED;
  }
}

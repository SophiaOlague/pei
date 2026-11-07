// M08 (AP-1, AP-11, AP-22): carga inicial del precio global (200.00 MXN) y de la primera versión de la política de citas.
// Lógica del CLI sin efectos propios; el contexto de Nest y la BD se inyectan (appointments-config-seed.ts).
//
//   pnpm appointments:seed-config --created-by <userProfileId del administrador> [--apply] [--confirm-production]
//
// - Por omisión es una SIMULACIÓN: muestra lo que haría y no escribe nada.
// - Escribe solo con --apply. Contra la rama de producción exige además --confirm-production.
// - Es idempotente: no crea nada si ya existe una versión de precio o de política.
// - created_by debe ser un user_profile con rol admin existente.
// Ejecutarlo en producción requiere una autorización expresa (AP-11): todavía no se ha ejecutado.
import { INITIAL_CONSULTATION_PRICE, CONSULTATION_CURRENCY } from '../modules/appointments/domain/consultation-price';
import { INITIAL_POLICY } from '../modules/appointments/domain/cancellation-policy';

export const EXIT_OK = 0;
export const EXIT_ABORTED = 1;
export const EXIT_USAGE = 2;
export const EXIT_UNEXPECTED = 3;

export const PRODUCTION_BRANCH_ID = 'br-royal-recipe-b54s5hnn';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USAGE = 'Uso: pnpm appointments:seed-config --created-by <userProfileId> [--apply] [--confirm-production]';

export interface SeedArgs {
  createdBy: string;
  apply: boolean;
  confirmProduction: boolean;
}

export function parseSeedArgs(argv: string[]): SeedArgs | null {
  let createdBy: string | null = null;
  let apply = false;
  let confirmProduction = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--created-by') createdBy = argv[++i] ?? null;
    else if (a === '--apply') apply = true;
    else if (a === '--confirm-production') confirmProduction = true;
    else return null;
  }
  return createdBy && UUID.test(createdBy) ? { createdBy, apply, confirmProduction } : null;
}

export interface SeedContext {
  branchId(): Promise<string | null>;
  isAdmin(userProfileId: string): Promise<{ userId: string } | null>;
  hasPriceVersion(): Promise<boolean>;
  hasPolicyVersion(): Promise<boolean>;
  publishPrice(admin: { userId: string; userProfileId: string }): Promise<void>;
  publishPolicy(admin: { userId: string; userProfileId: string }): Promise<void>;
}

export async function runAppointmentsConfigSeed(argv: string[], ctx: SeedContext, log: (l: string) => void, error: (l: string) => void): Promise<number> {
  const args = parseSeedArgs(argv);
  if (!args) {
    error(USAGE);
    return EXIT_USAGE;
  }
  try {
    const branch = await ctx.branchId();
    const production = branch === PRODUCTION_BRANCH_ID;
    log(`Destino: ${production ? 'PRODUCCIÓN' : `rama ${branch ?? 'desconocida'}`}`);
    const admin = await ctx.isAdmin(args.createdBy);
    if (!admin) {
      error('Abortado: --created-by no corresponde a un administrador existente');
      return EXIT_ABORTED;
    }
    const plan: string[] = [];
    const needPrice = !(await ctx.hasPriceVersion());
    const needPolicy = !(await ctx.hasPolicyVersion());
    if (needPrice) plan.push(`precio global ${INITIAL_CONSULTATION_PRICE} ${CONSULTATION_CURRENCY}`);
    if (needPolicy) plan.push(`política: plazo ${INITIAL_POLICY.refundDeadlineHours} h, ${INITIAL_POLICY.maxReschedules} reagendamientos, ventana del médico ${INITIAL_POLICY.doctorWaitMinutes} min, tolerancia ${INITIAL_POLICY.patientToleranceMinutes} min`);
    if (plan.length === 0) {
      log('Nada que hacer: ya existen versiones de precio y de política');
      return EXIT_OK;
    }
    if (!args.apply) {
      log(`SIMULACIÓN (sin --apply, no se escribe nada). Se crearía: ${plan.join('; ')}`);
      return EXIT_OK;
    }
    if (production && !args.confirmProduction) {
      error('Abortado: el destino es producción; se requiere --confirm-production y una autorización expresa');
      return EXIT_ABORTED;
    }
    const actor = { userId: admin.userId, userProfileId: args.createdBy };
    if (needPrice) await ctx.publishPrice(actor);
    if (needPolicy) await ctx.publishPolicy(actor);
    log(`Creado: ${plan.join('; ')}`);
    return EXIT_OK;
  } catch (e) {
    error(`Fallo inesperado: ${e instanceof Error ? e.message : String(e)}`);
    return EXIT_UNEXPECTED;
  }
}

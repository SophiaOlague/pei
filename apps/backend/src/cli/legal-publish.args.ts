import { LEGAL_AUDIENCES, LEGAL_DOCUMENT_TYPES, type LegalAudience, type LegalDocumentType } from '../modules/identity/domain/legal-requirements';

// Argumentos del CLI legal:publish (ver legal-publish.ts). Sin efectos: solo interpreta argv.
export class LegalPublishUsageError extends Error {}

export interface ParsedArgs {
  audience: string | null;
  docs: { type: LegalDocumentType; version: string; path: string }[];
  publishedAt: Date | undefined;
  dryRun: boolean;
  confirm: string | null;
  targetBranch: string | null;
  targetEndpoint: string | null;
  allowProduction: boolean;
  acceptRegimeTransition: boolean;
  allowProvisionalProduction: boolean;
  pastDateReason: string | null;
}

const VALUE_OPTIONS = ['--audience', '--published-at', '--confirm', '--target-branch', '--target-endpoint', '--allow-past-date'];
const SWITCHES = ['--dry-run', '--allow-production', '--accept-regime-transition', '--allow-provisional-production'];

export function parseLegalPublishArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    audience: null, docs: [], publishedAt: undefined, dryRun: false, confirm: null, targetBranch: null, targetEndpoint: null,
    allowProduction: false, acceptRegimeTransition: false, allowProvisionalProduction: false, pastDateReason: null,
  };
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]];
    const takesValue = flag === '--doc' || VALUE_OPTIONS.includes(flag);
    // No se repite el texto recibido: podría ser una URL o un valor pegado por error.
    if (!takesValue && !SWITCHES.includes(flag)) throw new LegalPublishUsageError('Argumento desconocido; revisa las opciones de legal:publish');
    // --doc es la única opción repetible; un tipo repetido lo rechaza el plan.
    if (flag !== '--doc' && seen.has(flag)) throw new LegalPublishUsageError(`${flag} no se puede repetir`);
    seen.add(flag);
    if (takesValue) {
      if (!value?.trim() || value.startsWith('--')) throw new LegalPublishUsageError(`${flag} requiere un valor`);
      i++;
    }
    if (flag === '--audience') {
      parsed.audience = value;
    } else if (flag === '--doc') {
      const match = /^([a-z_]+)@([^=]+)=(.+)$/.exec(value);
      if (!match || !(LEGAL_DOCUMENT_TYPES as readonly string[]).includes(match[1])) {
        throw new LegalPublishUsageError(`--doc debe tener la forma tipo@versión=ruta (tipos: ${LEGAL_DOCUMENT_TYPES.join(', ')})`);
      }
      parsed.docs.push({ type: match[1] as LegalDocumentType, version: match[2], path: match[3] });
    } else if (flag === '--published-at') {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) throw new LegalPublishUsageError('--published-at debe ser una fecha ISO 8601');
      parsed.publishedAt = date;
    } else if (flag === '--confirm') parsed.confirm = value;
    else if (flag === '--target-branch') parsed.targetBranch = value;
    else if (flag === '--target-endpoint') parsed.targetEndpoint = value;
    else if (flag === '--allow-past-date') parsed.pastDateReason = value;
    else if (flag === '--dry-run') parsed.dryRun = true;
    else if (flag === '--allow-production') parsed.allowProduction = true;
    else if (flag === '--accept-regime-transition') parsed.acceptRegimeTransition = true;
    else parsed.allowProvisionalProduction = true;
  }
  return parsed;
}

export interface ValidatedArgs extends ParsedArgs {
  audience: LegalAudience;
  publishedAt: Date;
  targetBranch: string;
  targetEndpoint: string;
}

// Combinaciones: se comprueban antes de leer archivos o abrir la conexión.
export function validateLegalPublishArgs(args: ParsedArgs): ValidatedArgs {
  const audience = LEGAL_AUDIENCES.find((candidate) => candidate === args.audience);
  if (!audience) throw new LegalPublishUsageError('--audience debe ser patient o doctor');
  if (args.docs.length === 0) throw new LegalPublishUsageError('Indica al menos un --doc');
  if (args.dryRun === (args.confirm !== null)) throw new LegalPublishUsageError('Indica --dry-run o --confirm <token>, no ambos');
  if (args.dryRun && (args.allowProduction || args.acceptRegimeTransition || args.allowProvisionalProduction)) {
    throw new LegalPublishUsageError('--dry-run no admite autorizaciones de escritura');
  }
  if (!args.targetBranch || !args.targetEndpoint) throw new LegalPublishUsageError('--target-branch y --target-endpoint son obligatorios');
  if (!args.publishedAt) throw new LegalPublishUsageError('--published-at es obligatorio');
  return { ...args, audience, publishedAt: args.publishedAt, targetBranch: args.targetBranch, targetEndpoint: args.targetEndpoint };
}

import { LEGAL_DOCUMENT_TYPES, type LegalDocumentType } from '../modules/identity/domain/legal-requirements';

// Argumentos del CLI legal:publish (ver legal-publish.ts). Sin efectos: solo interpreta argv.
export interface ParsedArgs {
  audience: string | null;
  docs: { type: LegalDocumentType; version: string; path: string }[];
  publishedAt: Date | undefined;
}

export function parseLegalPublishArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { audience: null, docs: [], publishedAt: undefined };
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === '--audience') {
      parsed.audience = value ?? null;
      i++;
    } else if (flag === '--doc') {
      const match = /^([a-z_]+)@([^=]+)=(.+)$/.exec(value ?? '');
      if (!match || !(LEGAL_DOCUMENT_TYPES as readonly string[]).includes(match[1])) {
        throw new Error(`--doc debe tener la forma tipo@versión=ruta (tipos: ${LEGAL_DOCUMENT_TYPES.join(', ')})`);
      }
      parsed.docs.push({ type: match[1] as LegalDocumentType, version: match[2], path: match[3] });
      i++;
    } else if (flag === '--published-at') {
      const date = new Date(value ?? '');
      if (Number.isNaN(date.getTime())) throw new Error('--published-at debe ser una fecha ISO 8601');
      parsed.publishedAt = date;
      i++;
    } else {
      throw new Error(`Argumento desconocido: ${flag}`);
    }
  }
  return parsed;
}

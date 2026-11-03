import { createHash } from 'crypto';
import { InvalidLegalPublicationError } from './identity.errors';
import {
  LEGACY_LEGAL_DOCUMENT_TYPES,
  LEGAL_AUDIENCES,
  LEGAL_REGIMES_BY_AUDIENCE,
  resolveLegalRegime,
  type LegalAudience,
  type LegalDocumentType,
} from './legal-requirements';

// Publicación segura de documentos legales (CLI legal:publish). Funciones puras: identifican la BD de destino, calculan
// el efecto de una publicación en AMBOS roles y vinculan la confirmación a ese resultado. No hay matriz de versiones
// compatibles: cada tipo se versiona por separado y solo se exige que cada rol termine en un régimen completo o sin cambios.

// Rama original del proyecto. Debe coincidir con ORIGINAL_BRANCH de test/support/c2-target-guard.ts (lo comprueba la prueba).
export const PRODUCTION_DATABASE = Object.freeze({ branch: 'br-royal-recipe-b54s5hnn', endpoint: 'ep-wandering-bonus-b5kxacor' });

export const CONFIRMATION_TTL_SECONDS = 15 * 60;
const VERSION_MAX = 50;
const PROVISIONAL_VERSION = /^dev-/i;
const PAST_DATE_REASON_MAX = 200;

export const isProvisionalVersion = (version: string): boolean => PROVISIONAL_VERSION.test(version);

export interface ObservedDatabaseTarget {
  // Valores de PostgreSQL (GUC de Neon) y primer segmento del host de DATABASE_URL, sin -pooler. Nunca la URL.
  branch: string | null;
  endpoint: string | null;
  project: string | null;
  urlEndpoint: string | null;
}

export interface DeclaredDatabaseTarget {
  branch: string;
  endpoint: string;
}

export interface VerifiedDatabaseTarget {
  kind: 'production' | 'development';
  branch: string;
  endpoint: string;
  project: string;
}

// Falla cerrado: quien ejecuta declara el destino y la BD debe confirmarlo. Sin identidad de Neon no hay publicación.
export function verifyDatabaseTarget(observed: ObservedDatabaseTarget, declared: DeclaredDatabaseTarget): VerifiedDatabaseTarget {
  const { branch, endpoint, project, urlEndpoint } = observed;
  if (!branch || !endpoint || !project || !urlEndpoint) throw new InvalidLegalPublicationError('No se pudo verificar la identidad de la base de datos de destino');
  if (urlEndpoint !== endpoint) throw new InvalidLegalPublicationError('DATABASE_URL no corresponde al endpoint que informa la base de datos');
  if (declared.branch !== branch || declared.endpoint !== endpoint) {
    throw new InvalidLegalPublicationError(`El destino declarado no coincide con la base de datos conectada (${branch} / ${endpoint})`);
  }
  const isBranch = branch === PRODUCTION_DATABASE.branch;
  const isEndpoint = endpoint === PRODUCTION_DATABASE.endpoint;
  if (isBranch !== isEndpoint) throw new InvalidLegalPublicationError('Destino ambiguo: la rama y el endpoint no pertenecen al mismo entorno');
  return { kind: isBranch ? 'production' : 'development', branch, endpoint, project };
}

export interface PublishedVersion {
  type: LegalDocumentType;
  version: string;
  publishedAt: Date;
}

export interface DocumentToPublish {
  type: LegalDocumentType;
  version: string;
  contentHash: string;
}

export interface LegalPublicationInput {
  audience: LegalAudience;
  documents: DocumentToPublish[];
  publishedAt: Date;
  // Motivo de la excepción aprobada para una fecha pasada.
  pastDateReason?: string;
  now: Date;
  versions: PublishedVersion[];
  usersByRole: Partial<Record<LegalAudience, number>>;
  target: VerifiedDatabaseTarget;
}

export type PublicationRequirement = 'production_target' | 'regime_transition' | 'provisional_in_production' | 'past_date';
export type PublicationNotice = 'patient_terms_activates_existing_privacy_policy' | 'partial_regime_without_effect';

export interface DocumentVersionRef {
  type: LegalDocumentType;
  version: string;
}

export interface RoleImpact {
  role: LegalAudience;
  regimeBefore: DocumentVersionRef[] | null;
  regimeAfter: DocumentVersionRef[] | null;
  regimeTransition: boolean;
  // Total de perfiles del rol: no descuenta aceptaciones ni cuenta usuarios futuros.
  potentiallyAffectedProfiles: number;
  pendingDocuments: DocumentVersionRef[];
}

// Cambio de régimen en una fecha ya programada, posterior a la entrada en vigor de esta publicación.
export interface ScheduledChange {
  at: Date;
  role: LegalAudience;
  regimeBefore: DocumentVersionRef[] | null;
  regimeAfter: DocumentVersionRef[] | null;
  regimeTransition: boolean;
  // El resultado en esa fecha sería distinto sin esta publicación.
  alteredByPublication: boolean;
  potentiallyAffectedProfiles: number;
}

export interface LegalPublicationPlan {
  target: VerifiedDatabaseTarget;
  audience: LegalAudience;
  documents: DocumentToPublish[];
  publishedAt: Date;
  pastDateReason: string | null;
  current: DocumentVersionRef[];
  future: (DocumentVersionRef & { publishedAt: Date })[];
  // regimeBefore: hoy; regimeAfter: al entrar en vigor esta publicación.
  roles: RoleImpact[];
  scheduledChanges: ScheduledChange[];
  requirements: PublicationRequirement[];
  notices: PublicationNotice[];
}

const refOf = ({ type, version }: DocumentVersionRef): DocumentVersionRef => ({ type, version });

// La versión de cada tipo en un instante: la de published_at más reciente que no lo supere.
function versionsAt(versions: readonly PublishedVersion[], instant: Date): Map<LegalDocumentType, PublishedVersion> {
  const latest = new Map<LegalDocumentType, PublishedVersion>();
  for (const doc of versions) {
    if (doc.publishedAt > instant) continue;
    const best = latest.get(doc.type);
    if (!best || doc.publishedAt > best.publishedAt) latest.set(doc.type, doc);
  }
  return latest;
}

function regimeOf(role: LegalAudience, versions: Map<LegalDocumentType, PublishedVersion>): DocumentVersionRef[] | null {
  const regime = resolveLegalRegime(role, versions.keys());
  return regime ? regime.map((type) => refOf(versions.get(type)!)) : null;
}

const sameTypes = (a: DocumentVersionRef[] | null, b: DocumentVersionRef[] | null) => (a?.map((d) => d.type).join() ?? '') === (b?.map((d) => d.type).join() ?? '');
const sameRefs = (a: DocumentVersionRef[] | null, b: DocumentVersionRef[] | null) => JSON.stringify(a) === JSON.stringify(b);

// Recorre cada fecha futura ya programada, con esta publicación incluida.
function planScheduledChanges(
  versions: readonly PublishedVersion[], withPublication: readonly PublishedVersion[], from: Date, usersByRole: LegalPublicationInput['usersByRole'],
): ScheduledChange[] {
  const instants = [...new Set(versions.filter((v) => v.publishedAt > from).map((v) => v.publishedAt.getTime()))].sort((a, b) => a - b);
  const changes: ScheduledChange[] = [];
  let previous = versionsAt(withPublication, from);
  for (const instant of instants) {
    const at = new Date(instant);
    const state = versionsAt(withPublication, at);
    const without = versionsAt(versions, at);
    for (const role of LEGAL_AUDIENCES) {
      const regimeBefore = regimeOf(role, previous);
      const regimeAfter = regimeOf(role, state);
      if (sameRefs(regimeBefore, regimeAfter)) continue;
      changes.push({
        at, role, regimeBefore, regimeAfter, regimeTransition: !sameTypes(regimeBefore, regimeAfter),
        alteredByPublication: !sameRefs(regimeAfter, regimeOf(role, without)), potentiallyAffectedProfiles: usersByRole[role] ?? 0,
      });
    }
    previous = state;
  }
  return changes;
}

function assertDocuments(input: LegalPublicationInput): void {
  const { audience, documents } = input;
  const regime = LEGAL_REGIMES_BY_AUDIENCE[audience]?.[0];
  if (!regime) throw new InvalidLegalPublicationError('Tipo de cuenta no válido');
  const types = documents.map((doc) => doc.type);
  if (types.length === 0) throw new InvalidLegalPublicationError('No hay documentos que publicar');
  if (new Set(types).size !== types.length) throw new InvalidLegalPublicationError('Un tipo de documento aparece más de una vez');
  if (types.some((type) => LEGACY_LEGAL_DOCUMENT_TYPES.includes(type))) {
    throw new InvalidLegalPublicationError('Los tipos de legado no se vuelven a publicar');
  }
  if (types.some((type) => !regime.includes(type))) {
    throw new InvalidLegalPublicationError(`Solo se publican los tipos del régimen de ${audience}: ${regime.join(', ')}`);
  }
  for (const doc of documents) {
    if (!doc.version?.trim() || doc.version.trim().length > VERSION_MAX) {
      throw new InvalidLegalPublicationError(`La versión de ${doc.type} debe tener entre 1 y ${VERSION_MAX} caracteres`);
    }
    if (input.versions.some((v) => v.type === doc.type && v.version === doc.version.trim())) {
      throw new InvalidLegalPublicationError(`La versión ${doc.version.trim()} de ${doc.type} ya existe; las versiones publicadas son inmutables`);
    }
  }
}

function assertDate(input: LegalPublicationInput): void {
  const { publishedAt, now, documents, versions, pastDateReason } = input;
  if (!(publishedAt instanceof Date) || Number.isNaN(publishedAt.getTime())) throw new InvalidLegalPublicationError('La fecha de publicación no es válida');
  if (publishedAt.getTime() < now.getTime() && !pastDateReason?.trim()) {
    throw new InvalidLegalPublicationError('La fecha de publicación no puede ser pasada sin una excepción justificada');
  }
  const reason = pastDateReason?.trim();
  if (reason && publishedAt.getTime() >= now.getTime()) throw new InvalidLegalPublicationError('--allow-past-date solo aplica a una fecha pasada');
  // El motivo llega a la auditoría: texto breve, sin correos ni URLs.
  if (reason && (reason.length > PAST_DATE_REASON_MAX || /@|:\/\//.test(reason))) {
    throw new InvalidLegalPublicationError(`El motivo debe tener hasta ${PAST_DATE_REASON_MAX} caracteres, sin correos ni URLs`);
  }
  for (const doc of documents) {
    const newer = versions.find((v) => v.type === doc.type && v.publishedAt.getTime() >= publishedAt.getTime());
    if (newer) throw new InvalidLegalPublicationError(`La fecha de publicación debe ser posterior a la versión ${newer.version} de ${doc.type}`);
  }
}

// Calcula el efecto en ambos roles sin escribir nada. Lanza si la publicación es inválida; lo que exige una autorización
// explícita queda en `requirements`.
export function planLegalPublication(input: LegalPublicationInput): LegalPublicationPlan {
  assertDocuments(input);
  assertDate(input);
  const { audience, publishedAt, now, versions, usersByRole, target } = input;
  const documents = input.documents.map((doc) => ({ ...doc, version: doc.version.trim() }));

  const before = versionsAt(versions, now);
  const incoming = documents.map((doc) => ({ type: doc.type, version: doc.version, publishedAt }));
  const withPublication = [...versions, ...incoming];
  // Una fecha pasada entra en vigor con el estado de hoy, incluidas las versiones de otros tipos posteriores a esa fecha.
  const effectiveAt = new Date(Math.max(publishedAt.getTime(), now.getTime()));
  const after = versionsAt(withPublication, effectiveAt);

  const missing = LEGAL_REGIMES_BY_AUDIENCE[audience][0].filter((type) => !after.has(type));
  if (missing.length > 0) {
    throw new InvalidLegalPublicationError(`Publicación parcial: falta ${missing.join(', ')} para completar el régimen de ${audience}`);
  }

  const roles = LEGAL_AUDIENCES.map((role): RoleImpact => {
    const regimeBefore = regimeOf(role, before);
    const regimeAfter = regimeOf(role, after);
    const regimeTransition = !sameTypes(regimeBefore, regimeAfter);
    const incomingInRegime = (regimeAfter ?? []).filter((doc) => documents.some((d) => d.type === doc.type));
    const pendingDocuments = regimeTransition ? (regimeAfter ?? []) : incomingInRegime;
    return { role, regimeBefore, regimeAfter, regimeTransition, potentiallyAffectedProfiles: pendingDocuments.length > 0 ? (usersByRole[role] ?? 0) : 0, pendingDocuments };
  });
  const scheduledChanges = planScheduledChanges(versions, withPublication, effectiveAt, usersByRole);

  const requirements: PublicationRequirement[] = [];
  if (target.kind === 'production') requirements.push('production_target');
  if (roles.some((role) => role.regimeTransition) || scheduledChanges.some((change) => change.regimeTransition && change.alteredByPublication)) requirements.push('regime_transition');
  // Incluye las versiones provisionales ya vigentes en el régimen de cualquier rol y las programadas.
  const regimes = [...roles, ...scheduledChanges].flatMap((item) => item.regimeAfter ?? []);
  const provisional = [...documents, ...regimes].some((doc) => isProvisionalVersion(doc.version));
  if (target.kind === 'production' && provisional) requirements.push('provisional_in_production');
  if (publishedAt.getTime() < now.getTime()) requirements.push('past_date');

  const notices: PublicationNotice[] = [];
  const patientTransitions = [...roles, ...scheduledChanges].filter((item) => item.role === 'patient' && item.regimeTransition);
  const activatesExistingPolicy = (regime: DocumentVersionRef[] | null) => {
    const policy = regime?.find((doc) => doc.type === 'privacy_policy');
    return !!policy && regime!.some((doc) => doc.type === 'patient_terms') && !documents.some((doc) => doc.type === 'privacy_policy' && doc.version === policy.version);
  };
  if (patientTransitions.some((item) => activatesExistingPolicy(item.regimeAfter))) {
    notices.push('patient_terms_activates_existing_privacy_policy');
  }
  if (roles.some((role) => !role.regimeTransition && role.pendingDocuments.length === 0 && LEGAL_REGIMES_BY_AUDIENCE[role.role][0].some((type) => documents.some((d) => d.type === type)))) {
    notices.push('partial_regime_without_effect');
  }

  return {
    target, audience, documents, publishedAt, pastDateReason: input.pastDateReason?.trim() || null,
    current: [...before.values()].map(refOf),
    future: versions.filter((v) => v.publishedAt > now).map((v) => ({ ...refOf(v), publishedAt: v.publishedAt })),
    roles, scheduledChanges, requirements, notices,
  };
}

// El conteo de usuarios no entra en el token: es informativo y cambiaría con cada registro nuevo.
function planFingerprint(plan: LegalPublicationPlan, issuedAt: number): string {
  const byRef = (a: DocumentVersionRef, b: DocumentVersionRef) => `${a.type}@${a.version}`.localeCompare(`${b.type}@${b.version}`);
  const canonical = JSON.stringify({
    issuedAt,
    target: [plan.target.kind, plan.target.branch, plan.target.endpoint, plan.target.project],
    audience: plan.audience,
    documents: plan.documents.map((doc) => [doc.type, doc.version, doc.contentHash]),
    publishedAt: plan.publishedAt.toISOString(),
    pastDateReason: plan.pastDateReason,
    current: [...plan.current].sort(byRef).map((doc) => [doc.type, doc.version]),
    future: [...plan.future].sort(byRef).map((doc) => [doc.type, doc.version, doc.publishedAt.toISOString()]),
    roles: plan.roles.map((role) => [role.role, role.regimeBefore, role.regimeAfter, role.regimeTransition, role.pendingDocuments]),
    scheduledChanges: plan.scheduledChanges.map((change) => [change.at.toISOString(), change.role, change.regimeBefore, change.regimeAfter, change.regimeTransition, change.alteredByPublication]),
    requirements: plan.requirements,
    notices: plan.notices,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function createPublicationConfirmation(plan: LegalPublicationPlan, now: Date): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return `${issuedAt}.${planFingerprint(plan, issuedAt)}`;
}

// Protege de errores operativos, no de un atacante: quien ejecuta el CLI ya tiene acceso a la BD.
export function assertPublicationConfirmation(plan: LegalPublicationPlan, confirmation: string, now: Date): void {
  const match = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(confirmation ?? '');
  if (!match) throw new InvalidLegalPublicationError('La confirmación no tiene un formato válido');
  const issuedAt = Number(match[1]);
  const age = Math.floor(now.getTime() / 1000) - issuedAt;
  if (age < 0 || age > CONFIRMATION_TTL_SECONDS) throw new InvalidLegalPublicationError('La confirmación caducó: repite la simulación');
  if (planFingerprint(plan, issuedAt) !== match[2]) {
    throw new InvalidLegalPublicationError('La publicación cambió desde la simulación: repite la simulación');
  }
}

export interface PublicationAuthorizations {
  allowProduction?: boolean;
  acceptRegimeTransition?: boolean;
  allowProvisionalInProduction?: boolean;
}

export function assertPublicationAuthorized(plan: LegalPublicationPlan, authorizations: PublicationAuthorizations): void {
  const missing: Record<PublicationRequirement, boolean> = {
    production_target: !authorizations.allowProduction,
    regime_transition: !authorizations.acceptRegimeTransition,
    provisional_in_production: !authorizations.allowProvisionalInProduction,
    past_date: false, // Se autoriza con el motivo, que ya forma parte del plan.
  };
  const pending = plan.requirements.filter((requirement) => missing[requirement]);
  if (pending.length > 0) throw new InvalidLegalPublicationError(`Falta autorización explícita: ${pending.join(', ')}`);
}

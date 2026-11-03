import type { DocumentVersionRef, LegalPublicationPlan, RoleImpact, ScheduledChange } from '../modules/identity/domain/legal-publication';

// Informe del CLI legal:publish. Solo identificadores técnicos y conteos: nunca contenido, URLs ni datos personales.
const refs = (docs: DocumentVersionRef[] | null) => (docs === null ? 'sin régimen' : docs.length === 0 ? 'ninguno' : docs.map((d) => `${d.type}@${d.version}`).join(', '));

const roleLines = (role: RoleImpact) => [
  `Rol ${role.role}:`,
  `  régimen actual:    ${refs(role.regimeBefore)}`,
  `  régimen resultante: ${refs(role.regimeAfter)}`,
  `  transición de régimen: ${role.regimeTransition ? 'SÍ' : 'no'}`,
  `  perfiles potencialmente afectados (total del rol, no aceptaciones pendientes): ${role.potentiallyAffectedProfiles}`,
  `  documentos pendientes: ${refs(role.pendingDocuments)}`,
];

const scheduledLine = (change: ScheduledChange) =>
  `  ${change.at.toISOString()} rol ${change.role}: ${refs(change.regimeBefore)} -> ${refs(change.regimeAfter)}; transición ${change.regimeTransition ? 'SÍ' : 'no'}; ` +
  `alterado por esta publicación ${change.alteredByPublication ? 'SÍ' : 'no'}; perfiles potencialmente afectados ${change.potentiallyAffectedProfiles}`;

export function formatPublicationPlan(plan: LegalPublicationPlan): string {
  return [
    `Destino: ${plan.target.kind.toUpperCase()} (rama ${plan.target.branch}, endpoint ${plan.target.endpoint}, proyecto ${plan.target.project})`,
    `Audiencia: ${plan.audience}`,
    `Fecha de publicación: ${plan.publishedAt.toISOString()}${plan.pastDateReason ? ` (excepción: ${plan.pastDateReason})` : ''}`,
    'Documentos:',
    ...plan.documents.map((doc) => `  ${doc.type}@${doc.version} sha256=${doc.contentHash}`),
    `Vigentes: ${refs(plan.current)}`,
    `Futuras: ${plan.future.length === 0 ? 'ninguna' : plan.future.map((d) => `${d.type}@${d.version} (${d.publishedAt.toISOString()})`).join(', ')}`,
    'Estado actual y estado en la fecha de publicación:',
    ...plan.roles.flatMap(roleLines),
    `Cambios futuros ya programados: ${plan.scheduledChanges.length === 0 ? 'ninguno' : ''}`,
    ...plan.scheduledChanges.map(scheduledLine),
    `Avisos: ${plan.notices.join(', ') || 'ninguno'}`,
    `Autorizaciones requeridas: ${plan.requirements.join(', ') || 'ninguna'}`,
  ].join('\n');
}

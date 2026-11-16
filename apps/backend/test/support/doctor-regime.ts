// Régimen legal del médico reutilizado por la concurrencia en la rama C2 (lógica pura, sin BD).
export const DOCTOR_LEGAL_TYPES = ['privacy_policy', 'doctor_terms'] as const;

export interface CurrentDoctorRegime {
  documents: { type: (typeof DOCTOR_LEGAL_TYPES)[number]; id: string; version: string; publishedAt: string }[];
  // Próxima publicación programada de cualquiera de los dos tipos (si existe): a partir de ella, la vigente cambia.
  nextScheduledAt: string | null;
  totalLegalDocuments: number;
}

// Condiciones para reutilizar el régimen: existen ambos tipos vigentes y ninguna publicación programada entra en vigor
// durante la ejecución (margen). Los mensajes no incluyen datos de usuarios.
export function assertReusableDoctorRegime(regime: CurrentDoctorRegime, now: Date, marginMs = 24 * 3600_000): void {
  const missing = DOCTOR_LEGAL_TYPES.filter((type) => !regime.documents.some((d) => d.type === type));
  if (missing.length > 0) {
    throw new Error(`No hay documentos legales vigentes de tipo ${missing.join(', ')} en la rama: el spec no publica documentos`);
  }
  if (regime.nextScheduledAt && new Date(regime.nextScheduledAt).getTime() - now.getTime() < marginMs) {
    throw new Error('Una publicación legal programada entra en vigor durante la ejecución: la versión vigente no sería estable');
  }
}

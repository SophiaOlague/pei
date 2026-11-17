const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// AAAA-MM-DD (formato del backend) → DD/MM/AAAA, solo para mostrar. Sin fecha o con otro formato → null:
// nunca se inventa una fecha.
export function formatIsoDateForDisplay(
  value: string | null | undefined
): string | null {
  const match = ISO_DATE.exec(value ?? "");
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

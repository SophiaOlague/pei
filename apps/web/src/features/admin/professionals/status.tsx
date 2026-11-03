import type {
  AdminDoctorStatusFields,
  DoctorGlobalStatus,
  DoctorLineStatus,
  LicenseReviewReason,
  ReviewStatus,
} from "@/lib/api";

// Presentación de los estados que devuelve el backend (D-38). La interfaz no deriva el estado administrativo ni la
// habilitación: solo los muestra. La aceptación legal es informativa y no genera acciones administrativas.

type Tone = "neutral" | "info" | "success" | "danger" | "warning";

const TONES: Record<Tone, string> = {
  neutral: "bg-[#F1F1F4] text-[#535353]",
  info: "bg-[#EEEAFE] text-[#4B33B5]",
  success: "bg-[#E6F6EE] text-[#1E7A4C]",
  danger: "bg-[#FDECEF] text-[#B4243F]",
  warning: "bg-[#FFF4E0] text-[#8A5A00]",
};

export function Badge({ tone, children }: { tone: Tone; children: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-medium whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export const ADMIN_STATUS_LABELS: Record<DoctorGlobalStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
};
const ADMIN_STATUS_TONES: Record<DoctorGlobalStatus, Tone> = {
  pending: "info",
  approved: "success",
  rejected: "danger",
};

export const LINE_LABELS: Record<DoctorLineStatus, string> = {
  required: "Sin enviar",
  pending: "En revisión",
  approved: "Aprobada",
  rejected: "Rechazada",
};
const LINE_TONES: Record<DoctorLineStatus, Tone> = {
  required: "neutral",
  pending: "info",
  approved: "success",
  rejected: "danger",
};

export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  superseded: "Sustituida",
};
const REVIEW_TONES: Record<ReviewStatus, Tone> = {
  pending: "info",
  approved: "success",
  rejected: "danger",
  superseded: "neutral",
};

export const LICENSE_REASON_LABELS: Record<LicenseReviewReason, string> = {
  initial: "Envío inicial",
  resubmission: "Reenvío",
  license_number_changed: "Cambio de número de cédula",
  license_document_changed: "Cambio de documento",
  specialty_changed: "Cambio de especialidad",
  legal_name_changed: "Cambio de nombre legal",
};

export const AdminStatusBadge = ({
  status,
}: {
  status: DoctorGlobalStatus;
}) => (
  <Badge tone={ADMIN_STATUS_TONES[status]}>{ADMIN_STATUS_LABELS[status]}</Badge>
);

export const LineBadge = ({ status }: { status: DoctorLineStatus }) => (
  <Badge tone={LINE_TONES[status]}>{LINE_LABELS[status]}</Badge>
);

export const ReviewBadge = ({ status }: { status: ReviewStatus }) => (
  <Badge tone={REVIEW_TONES[status]}>{REVIEW_LABELS[status]}</Badge>
);

export const LegalBadge = ({ accepted }: { accepted: boolean }) =>
  accepted ? (
    <Badge tone="success">Vigente</Badge>
  ) : (
    <Badge tone="warning">Pendiente de aceptar</Badge>
  );

export const OperationBadge = ({ canOperate }: { canOperate: boolean }) =>
  canOperate ? (
    <Badge tone="success">Habilitado</Badge>
  ) : (
    <Badge tone="neutral">No habilitado</Badge>
  );

// Motivo de un estado administrativo `pending`, leído de las líneas que informa el backend (no es un estado nuevo):
// una línea `pending` espera la revisión del administrador; una `required`, el envío del médico.
export function pendingReasons(
  s: Pick<AdminDoctorStatusFields, "status" | "identity" | "professional">,
): string[] {
  if (s.status !== "pending") return [];
  const lines = [s.identity, s.professional];
  return [
    ...(lines.includes("pending") ? ["Esperando revisión"] : []),
    ...(lines.includes("required") ? ["Esperando envío de documentación"] : []),
  ];
}

export function PendingReasons({
  status,
}: {
  status: Pick<AdminDoctorStatusFields, "status" | "identity" | "professional">;
}) {
  const reasons = pendingReasons(status);
  if (reasons.length === 0) return null;
  return (
    <span className="block text-[12px] text-[#6B6B6B] mt-1">
      {reasons.join(" · ")}
    </span>
  );
}

const dateFormat = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});
export const formatDate = (iso: string | null) =>
  iso ? dateFormat.format(new Date(iso)) : "—";

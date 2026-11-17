"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
  getPatientIdentityDocument,
  getPatientIdentityRequest,
  type PatientIdentityRequestDetail,
  type PatientIdentityReviewResult,
} from "@/lib/api";
import { ADMIN_PATIENT_IDENTITY_PATH } from "../paths";
import { isUnauthenticated } from "../professionals/admin-errors";
import {
  DocumentViewer,
  type PrivateDocument,
} from "../professionals/document-viewer";
import { formatDate, ReviewBadge } from "../professionals/status";
import { patientIdentityErrorMessage } from "./patient-identity-errors";
import { PatientReviewActions } from "./patient-review-actions";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6"
    >
      <h2 className="text-black text-[18px] font-medium mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[#89898A] text-[13px]">{label}</dt>
      <dd className="text-black text-[15px] mt-0.5">{children}</dd>
    </div>
  );
}

// Fecha de nacimiento AAAA-MM-DD: es una fecha civil, se muestra sin convertir de zona horaria.
const birthDateFormat = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "long",
  timeZone: "UTC",
});
const formatBirthDate = (value: string | null) =>
  value ? birthDateFormat.format(new Date(`${value}T00:00:00Z`)) : "—";

type Notice = { tone: "success" | "warning" | "error"; text: string };
const NOTICE_CLS: Record<Notice["tone"], string> = {
  success: "bg-[#E6F6EE] border-[#B7E3CB] text-[#1E7A4C]",
  warning: "bg-[#FFF4E0] border-[#F2D7A6] text-[#8A5A00]",
  error: "bg-[#FDECEF] border-[#F6C9D3] text-[#B4243F]",
};
const RESULT_TEXT: Record<PatientIdentityReviewResult["status"], string> = {
  approved: "Se aprobó la identidad del paciente.",
  rejected: "Se rechazó la identidad del paciente.",
};

// Detalle de una solicitud de verificación de identidad de un paciente. Los documentos se descargan con la sesión
// solo mientras la solicitud está pendiente (el backend los elimina al resolverla); aprobar y rechazar usan los
// endpoints de pacientes y el backend decide. El estado mostrado es siempre el que devuelve el backend.
export function PatientIdentityRequest({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<PatientIdentityRequestDetail | null>(
    null,
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [viewer, setViewer] = useState(false);

  // `silent`: recarga tras una acción sin vaciar la pantalla; si falla, se avisa y se conserva lo mostrado.
  const load = useCallback(
    async (silent = false) => {
      if (!silent) {
        setError("");
        setDetail(null);
      }
      try {
        setDetail(await getPatientIdentityRequest(requestId));
      } catch (e) {
        if (isUnauthenticated(e)) {
          router.replace("/login");
          return;
        }
        if (silent)
          setNotice({
            tone: "error",
            text: `No se pudo actualizar la solicitud: ${patientIdentityErrorMessage(e)}`,
          });
        else setError(patientIdentityErrorMessage(e));
      }
    },
    [requestId, router],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Éxito: la solicitud queda con el estado que devuelve el backend y sin acciones; después se recarga el detalle
  // (fecha de revisión y motivo).
  const resolved = (result: PatientIdentityReviewResult) => {
    setViewer(false);
    setNotice({
      tone: result.documentsDeleted ? "success" : "warning",
      text: result.documentsDeleted
        ? `${RESULT_TEXT[result.status]} Los documentos se eliminaron.`
        : `${RESULT_TEXT[result.status]} Los documentos aún no se pudieron eliminar; se eliminarán en la conciliación.`,
    });
    setDetail((prev) => (prev ? { ...prev, status: result.status } : prev));
    load(true);
  };

  // 409 o 404: la solicitud mostrada ya no es la real. Sin mensaje de éxito; se recarga el estado del servidor.
  const stale = (message: string) => {
    setViewer(false);
    setNotice({ tone: "warning", text: message });
    load(true);
  };

  const reload = () => load();
  const closeViewer = useCallback(() => setViewer(false), []);
  const back = (
    <Link
      href={ADMIN_PATIENT_IDENTITY_PATH}
      className="inline-flex items-center gap-1 text-[14px] text-[#684DDE] hover:underline"
    >
      <ChevronLeft size={16} aria-hidden="true" />
      Volver al listado
    </Link>
  );

  if (error)
    return (
      <div className="max-w-[1100px]">
        {back}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-4">
          <p role="alert" className="text-[#E23A5C] text-[15px]">
            {error}
          </p>
          <button
            type="button"
            onClick={reload}
            className="mt-4 px-4 py-2 rounded-lg bg-[#664BDB] text-white text-[14px] hover:bg-[#5a3fc4]"
          >
            Reintentar
          </button>
        </div>
      </div>
    );

  if (!detail)
    return (
      <div className="max-w-[1100px]">
        {back}
        <output className="block text-[#6B6B6B] text-[15px] mt-4">
          Cargando solicitud…
        </output>
      </div>
    );

  const { patient } = detail;
  const pending = detail.status === "pending";
  const documents: PrivateDocument[] = [
    {
      key: "front",
      label: "INE (frente)",
      fileName: "ine-frente",
      load: () => getPatientIdentityDocument(detail.id, "front"),
    },
    {
      key: "back",
      label: "INE (reverso)",
      fileName: "ine-reverso",
      load: () => getPatientIdentityDocument(detail.id, "back"),
    },
  ];

  return (
    <div className="max-w-[1100px] space-y-6">
      {back}
      <div>
        <h1 className="text-black text-[26px] sm:text-[32px] font-medium">
          {patient.firstName} {patient.lastName}
        </h1>
        <p className="text-[#6B6B6B] text-[15px] mt-1">
          Solicitud de verificación de identidad
        </p>
      </div>

      {notice && (
        <p
          role={notice.tone === "success" ? "status" : "alert"}
          className={`rounded-lg border px-4 py-3 text-[14px] ${NOTICE_CLS[notice.tone]}`}
        >
          {notice.text}
        </p>
      )}

      <Section title="Datos del paciente">
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Nombre">
            {patient.firstName} {patient.lastName}
          </Field>
          <Field label="Fecha de nacimiento">
            {formatBirthDate(patient.birthDate)}
          </Field>
          <Field label="CURP">{patient.curp}</Field>
        </dl>
      </Section>

      <Section title="Solicitud">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Estado">
            <ReviewBadge status={detail.status} />
          </Field>
          <Field label="Intento">{detail.attempt}</Field>
          <Field label="Enviada">{formatDate(detail.submittedAt)}</Field>
          <Field label="Revisada">{formatDate(detail.reviewedAt)}</Field>
          {detail.status === "rejected" && (
            <Field label="Motivo de rechazo">
              {detail.rejectionReason ?? "—"}
            </Field>
          )}
        </dl>

        {pending ? (
          <>
            <button
              type="button"
              onClick={() => setViewer(true)}
              className="mt-4 px-4 py-2 rounded-lg border border-[#684DDE] text-[#684DDE] text-[14px] hover:bg-[#F7F6FB]"
            >
              Ver documentos
            </button>
            <PatientReviewActions
              requestId={detail.id}
              onResolved={resolved}
              onStale={stale}
            />
          </>
        ) : (
          <p className="text-[#6B6B6B] text-[13px] mt-4">
            Esta solicitud ya fue revisada y no admite acciones. Sus documentos
            ya no están disponibles.
          </p>
        )}
      </Section>

      {viewer && pending && (
        <DocumentViewer
          title="INE del paciente"
          documents={documents}
          onClose={closeViewer}
        />
      )}
    </div>
  );
}

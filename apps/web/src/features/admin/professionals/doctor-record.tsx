"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
  type AdminDoctorDetail,
  type AdminIdentityReviewDetail,
  type AdminLicenseReviewDetail,
  type AdminReviewHistoryItem,
  type AdminReviewResult,
  getAdminDoctor,
  getDoctorIdentityDocument,
  getDoctorIdentityReview,
  getDoctorLicenseDocument,
  getDoctorLicenseReview,
} from "@/lib/api";
import { ADMIN_PROFESSIONALS_PATH } from "../paths";
import { adminErrorMessage, isUnauthenticated } from "./admin-errors";
import { DocumentViewer, type PrivateDocument } from "./document-viewer";
import { ReviewActions, type ReviewLine } from "./review-actions";
import {
  AdminStatusBadge,
  formatDate,
  LegalBadge,
  LICENSE_REASON_LABELS,
  LineBadge,
  OperationBadge,
  PendingReasons,
  ReviewBadge,
} from "./status";

interface DoctorRecordData {
  doctor: AdminDoctorDetail;
  // Revisión pendiente de cada línea, con la vigencia y la disponibilidad que confirma el backend.
  identityReview: AdminIdentityReviewDetail | null;
  licenseReview: AdminLicenseReviewDetail | null;
}

// La revisión pendiente de una línea es la de mayor intento con estado `pending`; el backend confirma si es la vigente.
const pendingOf = <T extends AdminReviewHistoryItem>(items: T[]) =>
  items
    .filter((r) => r.status === "pending")
    .reduce<T | null>((a, b) => (a && a.attempt > b.attempt ? a : b), null);

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

// Solo una revisión pendiente y vigente admite acciones; el backend vuelve a comprobarlo al resolverla (R-2, E.5).
const isActionable = (
  review: AdminIdentityReviewDetail | AdminLicenseReviewDetail | null,
) => !!review && review.status === "pending" && review.isCurrent;

function PendingReview({
  title,
  review,
  documents,
  extra,
  onView,
  actions,
}: {
  title: string;
  review: AdminIdentityReviewDetail | AdminLicenseReviewDetail | null;
  documents: string;
  extra?: ReactNode;
  onView?: () => void;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <h3 className="text-[15px] font-medium text-black">{title}</h3>
      {review ? (
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
          <Field label="Estado">
            <ReviewBadge status={review.status} />
          </Field>
          <Field label="Intento">{review.attempt}</Field>
          <Field label="Revisión">{review.revision}</Field>
          <Field label="Enviada">{formatDate(review.submittedAt)}</Field>
          <Field label="Vigente">{review.isCurrent ? "Sí" : "No"}</Field>
          <Field label="Documentos">{documents}</Field>
          {extra}
        </dl>
      ) : null}
      {review && (
        <>
          {onView && (
            <button
              type="button"
              onClick={onView}
              className="mt-4 px-4 py-2 rounded-lg border border-[#684DDE] text-[#684DDE] text-[14px] hover:bg-[#F7F6FB]"
            >
              Ver documentos
            </button>
          )}
          {isActionable(review) ? (
            actions
          ) : (
            <p className="text-[#6B6B6B] text-[13px] mt-3">
              Esta revisión ya no admite acciones.
            </p>
          )}
        </>
      )}
      {review ? null : (
        <p className="text-[#6B6B6B] text-[14px] mt-2">
          Sin revisión pendiente.
        </p>
      )}
    </div>
  );
}

function HistoryTable({
  caption,
  rows,
  withReason,
}: {
  caption: string;
  rows: (AdminReviewHistoryItem & {
    reason?: keyof typeof LICENSE_REASON_LABELS;
    licenseNumber?: string;
  })[];
  withReason?: boolean;
}) {
  if (rows.length === 0)
    return (
      <p className="text-[#6B6B6B] text-[14px]">
        {caption}: sin envíos registrados.
      </p>
    );
  const sorted = [...rows].sort((a, b) => b.attempt - a.attempt);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[14px]">
        <caption className="text-left text-[15px] font-medium text-black mb-2">
          {caption}
        </caption>
        <thead className="text-[#6B6B6B]">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">
              Intento
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Revisión
            </th>
            {withReason && (
              <th scope="col" className="py-2 pr-4 font-medium">
                Motivo del envío
              </th>
            )}
            <th scope="col" className="py-2 pr-4 font-medium">
              Estado
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Enviada
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Revisada
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Motivo de rechazo
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-t border-gray-100 align-top">
              <td className="py-2 pr-4">{r.attempt}</td>
              <td className="py-2 pr-4">{r.revision}</td>
              {withReason && (
                <td className="py-2 pr-4">
                  {r.reason ? LICENSE_REASON_LABELS[r.reason] : "—"}
                  {r.licenseNumber && (
                    <span className="block text-[12px] text-[#6B6B6B]">
                      Cédula {r.licenseNumber}
                    </span>
                  )}
                </td>
              )}
              <td className="py-2 pr-4">
                <ReviewBadge status={r.status} />
              </td>
              <td className="py-2 pr-4 whitespace-nowrap">
                {formatDate(r.submittedAt)}
              </td>
              <td className="py-2 pr-4 whitespace-nowrap">
                {formatDate(r.reviewedAt)}
              </td>
              <td className="py-2 pr-4">{r.rejectionReason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Notice = { tone: "success" | "warning" | "error"; text: string };
const NOTICE_CLS: Record<Notice["tone"], string> = {
  success: "bg-[#E6F6EE] border-[#B7E3CB] text-[#1E7A4C]",
  warning: "bg-[#FFF4E0] border-[#F2D7A6] text-[#8A5A00]",
  error: "bg-[#FDECEF] border-[#F6C9D3] text-[#B4243F]",
};
const RESULT_TEXT: Record<
  ReviewLine,
  Record<"approved" | "rejected", string>
> = {
  identity: {
    approved: "Se aprobó la revisión de identidad.",
    rejected: "Se rechazó la revisión de identidad.",
  },
  license: {
    approved: "Se aprobó la revisión de la cédula.",
    rejected: "Se rechazó la revisión de la cédula.",
  },
};

// Expediente del médico para el administrador. Estados administrativos y legales en secciones independientes (D-38).
// El visor descarga los documentos con la sesión; aprobar y rechazar usan los endpoints del backend, que decide.
export function DoctorRecord({ doctorProfileId }: { doctorProfileId: string }) {
  const router = useRouter();
  const [record, setRecord] = useState<DoctorRecordData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [viewer, setViewer] = useState<ReviewLine | null>(null);

  // `silent`: recarga tras una acción sin vaciar la pantalla; si falla, se avisa y se conserva lo mostrado.
  const load = useCallback(
    async (silent = false) => {
      if (!silent) {
        setError("");
        setRecord(null);
      }
      try {
        const doctor = await getAdminDoctor(doctorProfileId);
        const ine = pendingOf(doctor.history.identity);
        const lic = pendingOf(doctor.history.license);
        const [identityReview, licenseReview] = await Promise.all([
          ine ? getDoctorIdentityReview(ine.id) : null,
          lic ? getDoctorLicenseReview(lic.id) : null,
        ]);
        setRecord({ doctor, identityReview, licenseReview });
      } catch (e) {
        if (isUnauthenticated(e)) {
          router.replace("/login");
          return;
        }
        if (silent)
          setNotice({
            tone: "error",
            text: `No se pudo actualizar el expediente: ${adminErrorMessage(e)}`,
          });
        else setError(adminErrorMessage(e));
      }
    },
    [doctorProfileId, router],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Éxito: el estado del médico es el doctorStatus que devuelve el backend (D-38); la revisión queda resuelta y sin
  // acciones. Después se recarga el expediente para el historial.
  const resolved = (line: ReviewLine) => (result: AdminReviewResult) => {
    setViewer(null);
    setNotice({ tone: "success", text: RESULT_TEXT[line][result.status] });
    setRecord((prev) => {
      if (!prev) return prev;
      const key = line === "identity" ? "identityReview" : "licenseReview";
      const review = prev[key];
      return {
        ...prev,
        doctor: { ...prev.doctor, ...result.doctorStatus },
        [key]: review ? { ...review, status: result.status } : review,
      };
    });
    load(true);
  };

  // 409 o 404: la revisión mostrada ya no es la real. Sin mensaje de éxito; se recarga el estado del servidor.
  const stale = (message: string) => {
    setViewer(null);
    setNotice({ tone: "warning", text: message });
    load(true);
  };

  const reload = () => load();
  const back = (
    <Link
      href={ADMIN_PROFESSIONALS_PATH}
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

  if (!record)
    return (
      <div className="max-w-[1100px]">
        {back}
        <output className="block text-[#6B6B6B] text-[15px] mt-4">
          Cargando expediente…
        </output>
      </div>
    );

  const { doctor: d, identityReview, licenseReview } = record;

  const identityDocuments: PrivateDocument[] = identityReview
    ? (["front", "back"] as const).map((side) => ({
        key: `${identityReview.id}-${side}`,
        label: side === "front" ? "Frente" : "Reverso",
        load: () => getDoctorIdentityDocument(identityReview.id, side),
        fileName: `ine-${side}`,
      }))
    : [];
  const licenseDocuments: PrivateDocument[] = licenseReview
    ? [
        {
          key: licenseReview.id,
          label: "Cédula profesional",
          load: () => getDoctorLicenseDocument(licenseReview.id),
          fileName: `cedula-intento-${licenseReview.attempt}.pdf`,
        },
      ]
    : [];

  return (
    <div className="max-w-[1100px] space-y-5">
      {back}
      {notice && (
        <p
          role={notice.tone === "success" ? "status" : "alert"}
          className={`rounded-lg border px-4 py-3 text-[14px] ${NOTICE_CLS[notice.tone]}`}
        >
          {notice.text}
        </p>
      )}
      <div>
        <h1 className="text-black text-[26px] sm:text-[32px] font-medium">
          {d.firstName} {d.lastName}
        </h1>
        <p className="text-[#6B6B6B] text-[15px]">
          {d.specialty?.name ?? "Sin especialidad"}
        </p>
      </div>

      <Section title="Datos del profesional">
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Nombre legal">
            {d.firstName} {d.lastName}
          </Field>
          <Field label="CURP">
            <span className="font-mono">{d.curp}</span>
          </Field>
          <Field label="Teléfono">{d.phone ?? "No registrado"}</Field>
          <Field label="Especialidad">
            {d.specialty
              ? `${d.specialty.name}${d.specialty.isActive ? "" : " (inactiva)"}`
              : "Sin especialidad"}
          </Field>
          <Field label="Número de cédula">
            {d.licenseNumber ?? "No registrado"}
          </Field>
        </dl>
      </Section>

      <Section title="Revisión administrativa">
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Estado administrativo">
            <AdminStatusBadge status={d.status} />
            <PendingReasons status={d} />
          </Field>
          <Field label="Identidad (INE)">
            <LineBadge status={d.identity} />
          </Field>
          <Field label="Cédula profesional">
            <LineBadge status={d.professional} />
          </Field>
        </dl>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
          <PendingReview
            title="Revisión pendiente de identidad"
            review={identityReview}
            documents={
              identityReview?.documentsAvailable
                ? "Disponibles para revisión"
                : "No disponibles"
            }
            onView={
              identityReview?.documentsAvailable
                ? () => setViewer("identity")
                : undefined
            }
            actions={
              identityReview && (
                <ReviewActions
                  line="identity"
                  reviewId={identityReview.id}
                  onResolved={resolved("identity")}
                  onStale={stale}
                />
              )
            }
          />
          <PendingReview
            title="Revisión pendiente de cédula"
            review={licenseReview}
            // D-16: la cédula se conserva, pero el backend no informa su disponibilidad: se confirma al abrirla.
            documents="Se confirma al abrirla"
            onView={() => setViewer("license")}
            actions={
              licenseReview && (
                <ReviewActions
                  line="license"
                  reviewId={licenseReview.id}
                  onResolved={resolved("license")}
                  onStale={stale}
                />
              )
            }
            extra={
              licenseReview && (
                <>
                  <Field label="Motivo del envío">
                    {LICENSE_REASON_LABELS[licenseReview.reason]}
                  </Field>
                  <Field label="Cédula enviada">
                    {licenseReview.licenseNumber}
                  </Field>
                </>
              )
            }
          />
        </div>
      </Section>

      <Section title="Aceptación legal y habilitación">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Documentos legales vigentes">
            <LegalBadge accepted={d.legalAccepted} />
          </Field>
          <Field label="Habilitación operativa">
            <OperationBadge canOperate={d.canOperate} />
          </Field>
        </dl>
        <p className="text-[#6B6B6B] text-[13px] mt-4">
          La aceptación legal la realiza el profesional y no requiere acciones
          administrativas. No modifica la aprobación de sus documentos.
        </p>
      </Section>

      <Section title="Historial de revisiones">
        <div className="space-y-6">
          <HistoryTable caption="Identidad (INE)" rows={d.history.identity} />
          <HistoryTable
            caption="Cédula profesional"
            rows={d.history.license}
            withReason
          />
        </div>
      </Section>
      {viewer === "identity" && identityReview && (
        <DocumentViewer
          title={`INE · intento ${identityReview.attempt}`}
          documents={identityDocuments}
          onClose={() => setViewer(null)}
        />
      )}
      {viewer === "license" && licenseReview && (
        <DocumentViewer
          title={`Cédula profesional · intento ${licenseReview.attempt}`}
          documents={licenseDocuments}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  ApiError,
  approvePatientIdentityRequest,
  type PatientIdentityReviewResult,
  REJECTION_REASON_MAX,
  REJECTION_REASON_MIN,
  rejectPatientIdentityRequest,
} from "@/lib/api";
import { patientIdentityActionError } from "./patient-identity-errors";

const dialogCls =
  "relative bg-white rounded-xl w-full max-w-[520px] p-5 sm:p-6 m-0";
const primaryCls =
  "px-4 py-2 rounded-lg text-white text-[14px] disabled:opacity-50";
const secondaryCls =
  "px-4 py-2 rounded-lg border border-gray-300 bg-white text-[14px] disabled:opacity-50";

// Aprobar o rechazar una solicitud pendiente de identidad de paciente (mismo patrón que la revisión de médicos).
// La interfaz no decide: el backend valida el motivo y que la solicitud siga pendiente. Con éxito se entrega su
// resultado a quien llama; un 409/404 (`stale`) obliga a recargar.
export function PatientReviewActions({
  requestId,
  onResolved,
  onStale,
}: {
  requestId: string;
  onResolved: (result: PatientIdentityReviewResult) => void;
  onStale: (message: string) => void;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Bloqueo síncrono: dos clics antes del re-render no envían dos peticiones.
  const inFlight = useRef(false);

  const trimmed = reason.trim();
  const reasonError =
    trimmed.length < REJECTION_REASON_MIN
      ? `El motivo debe tener al menos ${REJECTION_REASON_MIN} caracteres.`
      : trimmed.length > REJECTION_REASON_MAX
        ? `El motivo no puede superar ${REJECTION_REASON_MAX} caracteres.`
        : "";

  const close = () => {
    if (inFlight.current) return;
    setDialog(null);
    setReason("");
    setTouched(false);
    setError("");
  };

  const run = async (call: () => Promise<PatientIdentityReviewResult>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await call();
      inFlight.current = false;
      setBusy(false);
      setDialog(null);
      onResolved(result);
    } catch (e) {
      inFlight.current = false;
      setBusy(false);
      if (e instanceof ApiError && e.status === 401) {
        router.replace("/login");
        return;
      }
      const { message, stale } = patientIdentityActionError(e);
      if (stale) {
        setDialog(null);
        onStale(message);
        return;
      }
      setError(message);
    }
  };

  const approve = () => run(() => approvePatientIdentityRequest(requestId));
  const reject = () => {
    setTouched(true);
    if (reasonError) return;
    run(() => rejectPatientIdentityRequest(requestId, trimmed));
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-4">
        <button
          type="button"
          onClick={() => setDialog("approve")}
          className={`${primaryCls} bg-[#1E7A4C] hover:bg-[#186540]`}
        >
          Aprobar
        </button>
        <button
          type="button"
          onClick={() => setDialog("reject")}
          className={`${primaryCls} bg-[#B4243F] hover:bg-[#9a1f36]`}
        >
          Rechazar
        </button>
      </div>

      {dialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <dialog
            open
            aria-modal="true"
            aria-label={
              dialog === "approve"
                ? "Aprobar la identidad del paciente"
                : "Rechazar la identidad del paciente"
            }
            className={dialogCls}
          >
            {dialog === "approve" ? (
              <>
                <h2 className="text-black text-[18px] font-medium">
                  ¿Aprobar la identidad del paciente?
                </h2>
                <p className="text-[#535353] text-[14px] mt-2">
                  Confirma que los datos del paciente coinciden con su INE. Al
                  resolver la solicitud, los documentos se eliminan.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-black text-[18px] font-medium">
                  Rechazar la identidad del paciente
                </h2>
                <label
                  htmlFor="reason-patient-identity"
                  className="block text-[14px] text-black mt-4"
                >
                  Motivo del rechazo (obligatorio)
                </label>
                <textarea
                  id="reason-patient-identity"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  onBlur={() => setTouched(true)}
                  rows={4}
                  aria-invalid={touched && !!reasonError}
                  aria-describedby="reason-patient-identity-help"
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-[14px] focus:outline-none focus:border-[#684DDE]"
                />
                <p
                  id="reason-patient-identity-help"
                  className="text-[12px] text-[#6B6B6B] mt-1"
                >
                  {trimmed.length}/{REJECTION_REASON_MAX} caracteres · mínimo{" "}
                  {REJECTION_REASON_MIN}. El paciente verá este motivo.
                </p>
                {touched && reasonError && (
                  <p className="text-[13px] text-[#E23A5C] mt-1">
                    {reasonError}
                  </p>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="text-[14px] text-[#E23A5C] mt-3">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className={secondaryCls}
              >
                Cancelar
              </button>
              {dialog === "approve" ? (
                <button
                  type="button"
                  onClick={approve}
                  disabled={busy}
                  className={`${primaryCls} bg-[#1E7A4C]`}
                >
                  {busy ? "Aprobando…" : "Confirmar aprobación"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={reject}
                  disabled={busy}
                  className={`${primaryCls} bg-[#B4243F]`}
                >
                  {busy ? "Rechazando…" : "Confirmar rechazo"}
                </button>
              )}
            </div>
          </dialog>
        </div>
      )}
    </>
  );
}

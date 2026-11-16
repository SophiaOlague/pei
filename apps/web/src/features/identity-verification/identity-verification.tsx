"use client";

import { Camera, IdCard } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { UserMenu } from "@/features/components/user-menu";
import {
  ApiError,
  getIdentityVerification,
  getRegistrationStatus,
  IDENTITY_DOCUMENT_MAX_BYTES,
  IDENTITY_DOCUMENT_TYPES,
  type IdentityVerification as IdentityVerificationState,
  submitIdentityVerification,
} from "@/lib/api";
import { BOOKING_PATH, bookingPathFor } from "./paths";

// Verificación de identidad del paciente (RF-07), equivalente a la pantalla móvil.
//   GET  /me/identity-verification → not_submitted | pending | approved | rejected (con motivo).
//   POST /me/identity-verification → multipart front/back; el backend valida y guarda los documentos.
// Las imágenes solo viven en memoria (File + blob: URL local para la vista previa), se liberan al reemplazarlas,
// al enviarlas y al salir, y nunca se registran. El estado mostrado SIEMPRE es el que devuelve el backend: tras un
// envío se vuelve a consultar. «Agendar» solo aparece si GET /me/registration-status confirma canBookAppointments.

type Side = "front" | "back";
const SIDE_LABEL: Record<Side, string> = {
  front: "Frente de la INE",
  back: "Reverso de la INE",
};
const PREVIEW_LABEL: Record<Side, string> = {
  front: "Vista previa del frente",
  back: "Vista previa del reverso",
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; verification: IdentityVerificationState }
  | { kind: "error"; message: string };

type Feedback =
  | { kind: "none" }
  | { kind: "received" }
  | { kind: "error"; message: string }
  | { kind: "ambiguous" };

const AMBIGUOUS_MESSAGE =
  "No pudimos confirmar si recibimos tus documentos. Consulta el estado antes de volver a enviarlos.";

const labelClass =
  "text-sm sm:text-base md:text-[18px] font-light text-[#999999]";
const valueClass =
  "text-sm sm:text-base md:text-[18px] font-light text-[#000000] break-words";
const buttonClass =
  "w-full sm:w-[194px] h-10 sm:h-[38px] bg-transparent border border-gray-400 rounded-lg text-sm sm:text-base font-medium text-[#535353] hover:bg-gray-50 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
const primaryClass =
  "w-full sm:w-[240px] h-11 sm:h-[42px] bg-[#7355F7] rounded-lg text-white text-sm sm:text-base font-medium hover:bg-[#6244d9] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
const linkButtonClass =
  "text-sm sm:text-base font-medium text-[#7355F7] hover:underline transition cursor-pointer disabled:opacity-50";
const cardClass =
  "w-full bg-[#F8F8F8] rounded-2xl p-4 sm:p-6 md:p-8 mb-4 sm:mb-6";
const titleClass =
  "text-base sm:text-lg font-medium text-[#000000] mb-4 sm:mb-6";

// Validación previa para avisar antes de enviar; el backend decide por el contenido real.
function validateDocument(file: File): string | null {
  if (!IDENTITY_DOCUMENT_TYPES.includes(file.type))
    return "La imagen debe ser JPEG o PNG.";
  if (file.size > IDENTITY_DOCUMENT_MAX_BYTES)
    return "Cada imagen debe pesar máximo 5 MB.";
  return null;
}

// null: resultado ambiguo (sin respuesta o 5xx): pudo haberse recibido.
function submitErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500)
    return null;
  if (error.status === 413) return "Cada imagen debe pesar máximo 5 MB.";
  return error.message;
}

// bookingDoctorId: médico que se estaba agendando (contexto de regreso; se valida en bookingPathFor).
export function IdentityVerification({
  fromBooking = false,
  bookingDoctorId = null,
}: {
  fromBooking?: boolean;
  bookingDoctorId?: string | null;
}) {
  const router = useRouter();
  const bookingHref = bookingPathFor(bookingDoctorId);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [feedback, setFeedback] = useState<Feedback>({ kind: "none" });

  const handleAuthError = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return true;
      }
      return false;
    },
    [router],
  );

  // Consulta sin pasar por «cargando»: lo mostrado (y lo elegido en el formulario) se conserva mientras tanto.
  //   show → si falla, se muestra el error.   keep → si falla, no cambia nada (devuelve false).
  const fetchStatus = useCallback(
    async (onFailure: "show" | "keep"): Promise<boolean> => {
      try {
        const verification = await getIdentityVerification();
        setState({ kind: "ready", verification });
        return true;
      } catch (error) {
        if (handleAuthError(error)) return false;
        if (onFailure === "show")
          setState({
            kind: "error",
            message:
              error instanceof ApiError
                ? error.message
                : "No pudimos consultar tu verificación.",
          });
        return false;
      }
    },
    [handleAuthError],
  );

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    await fetchStatus("show");
  }, [fetchStatus]);
  const refresh = useCallback(async () => {
    await fetchStatus("show");
  }, [fetchStatus]);
  const check = useCallback(() => fetchStatus("keep"), [fetchStatus]);

  useEffect(() => {
    load();
  }, [load]);

  const status = state.kind === "ready" ? state.verification.status : null;
  const canSubmit = status === "not_submitted" || status === "rejected";

  const refreshPending = async () => {
    setFeedback((prev) => (prev.kind === "received" ? prev : { kind: "none" }));
    await refresh();
  };

  return (
    <div className="min-h-screen bg-white pb-8 sm:pb-12">
      <nav className="flex items-center justify-between px-4 sm:px-6 md:px-8 py-3 sm:py-4 md:py-6 border-b border-gray-200">
        <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex-shrink-0">
          <Image
            src="/logo.svg"
            alt="Logo"
            width={80}
            height={80}
            className="object-contain w-full h-full"
          />
        </div>
        <UserMenu />
      </nav>

      <div className="px-4 sm:px-6 md:px-8 max-w-7xl mx-auto">
        <div className="flex flex-col gap-2 mt-4 sm:mt-6 md:mt-8 lg:mt-10 mb-4 sm:mb-6 md:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-[48px] font-medium leading-tight sm:leading-snug lg:leading-[56px] text-[#000000]">
            Verificación de identidad
          </h1>
          <Link
            href={fromBooking ? bookingHref : "/perfil-usuario"}
            className={`${linkButtonClass} w-fit`}
          >
            {fromBooking ? "Volver a agendar" : "Volver a mi perfil"}
          </Link>
        </div>

        {state.kind === "loading" && (
          <p className={labelClass}>Consultando tu verificación...</p>
        )}

        {state.kind === "error" && (
          <div className={cardClass}>
            <p role="alert" className="text-[#E23A5C] text-[16px]">
              No pudimos consultar tu verificación. {state.message}
            </p>
            <button
              type="button"
              onClick={load}
              className={`${buttonClass} mt-4`}
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Confirmación de recepción: la dio el backend (201). El estado de la revisión es el que devuelve GET. */}
        {feedback.kind === "received" && !canSubmit && (
          <output className="block text-[#664BDB] text-[16px] mb-4">
            Recibimos tus documentos.
          </output>
        )}

        {status === "pending" && (
          <section aria-label="En revisión" className={cardClass}>
            <h2 className={titleClass}>En revisión</h2>
            <p className={valueClass}>
              Tu INE está en revisión. Podrás agendar consultas cuando tu
              identidad sea aprobada.
            </p>
            <button
              type="button"
              onClick={refreshPending}
              className={`${buttonClass} mt-4`}
            >
              Actualizar estado
            </button>
          </section>
        )}

        {status === "approved" && (
          <ApprovedSection
            fromBooking={fromBooking}
            bookingHref={fromBooking ? bookingHref : BOOKING_PATH}
          />
        )}

        {state.kind === "ready" && status === "rejected" && (
          <section
            aria-label="Identificación rechazada"
            className="w-full bg-[#FDECEF] rounded-2xl p-4 sm:p-6 md:p-8 mb-4 sm:mb-6"
          >
            <h2 className="text-base sm:text-lg font-medium text-[#B4243F] mb-2">
              Tu identificación fue rechazada
            </h2>
            <p className="text-[#B4243F] text-[16px]">
              {state.verification.rejectionReason
                ? `Motivo: ${state.verification.rejectionReason}`
                : "No se indicó un motivo."}
            </p>
            <p className="text-[#B4243F] text-[14px] mt-2">
              Envía de nuevo el frente y el reverso de tu INE.
            </p>
          </section>
        )}

        {canSubmit && (
          <DocumentsForm
            resubmission={status === "rejected"}
            feedback={feedback}
            onFeedback={setFeedback}
            onSubmitted={refresh}
            onCheck={check}
            onAuthError={handleAuthError}
          />
        )}
      </div>
    </div>
  );
}

// Aprobada: la reserva se ofrece solo si el backend confirma canBookAppointments (puede faltar otro requisito).
function ApprovedSection({
  fromBooking,
  bookingHref,
}: {
  fromBooking: boolean;
  bookingHref: string;
}) {
  const [canBook, setCanBook] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    getRegistrationStatus()
      .then((s) => {
        if (active) setCanBook(s.canBookAppointments);
      })
      .catch(() => {
        if (active) setCanBook(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section aria-label="Identidad verificada" className={cardClass}>
      <h2 className={titleClass}>Identidad verificada</h2>
      <output className="block text-[#1E7A4C] text-[16px]">
        Tu identidad fue aprobada.
      </output>
      {canBook === null && (
        <p className={`${labelClass} mt-4`}>Consultando tu registro...</p>
      )}
      {canBook === false && (
        <p className={`${labelClass} mt-4`}>
          Todavía no puedes agendar consultas: tu registro tiene requisitos
          pendientes.
        </p>
      )}
      {canBook && (
        <Link
          href={bookingHref}
          className={`${primaryClass} mt-4 inline-flex items-center justify-center`}
        >
          {fromBooking ? "Continuar con la reserva" : "Agendar una cita"}
        </Link>
      )}
    </section>
  );
}

type Picked = { file: File; url: string };

function DocumentsForm({
  resubmission,
  feedback,
  onFeedback,
  onSubmitted,
  onCheck,
  onAuthError,
}: {
  resubmission: boolean;
  feedback: Feedback;
  onFeedback: (feedback: Feedback) => void;
  onSubmitted: () => Promise<void>;
  onCheck: () => Promise<boolean>;
  onAuthError: (error: unknown) => boolean;
}) {
  const [picked, setPicked] = useState<Record<Side, Picked | null>>({
    front: null,
    back: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  // Bloqueo síncrono: dos clics antes del re-render no hacen dos envíos (el backend solo admite uno pendiente).
  const inFlight = useRef(false);
  // URLs vigentes, para liberarlas al salir aunque el estado ya no esté disponible.
  const urls = useRef(new Set<string>());

  useEffect(() => {
    const current = urls.current;
    return () => {
      for (const url of current) URL.revokeObjectURL(url);
      current.clear();
    };
  }, []);

  const release = (item: Picked | null) => {
    if (!item) return;
    URL.revokeObjectURL(item.url);
    urls.current.delete(item.url);
  };

  const choose = (side: Side, file: File | undefined) => {
    if (!file) return;
    const invalid = validateDocument(file);
    if (invalid) {
      onFeedback({ kind: "error", message: invalid });
      return;
    }
    const url = URL.createObjectURL(file);
    urls.current.add(url);
    setPicked((prev) => {
      release(prev[side]);
      return { ...prev, [side]: { file, url } };
    });
    onFeedback({ kind: "none" });
  };

  const clear = () => {
    setPicked((prev) => {
      release(prev.front);
      release(prev.back);
      return { front: null, back: null };
    });
  };

  const handleSubmit = async () => {
    const { front, back } = picked;
    if (!(front && back) || inFlight.current) return;
    inFlight.current = true;
    onFeedback({ kind: "none" });
    setSubmitting(true);
    let reload = true;
    try {
      await submitIdentityVerification(front.file, back.file);
      clear();
      onFeedback({ kind: "received" });
    } catch (error) {
      if (onAuthError(error)) {
        reload = false;
      } else if (error instanceof ApiError && error.status === 409) {
        // Ya hay un envío en revisión o la identidad ya fue aprobada: se muestra el estado real.
        onFeedback({ kind: "error", message: error.message });
      } else {
        const message = submitErrorMessage(error);
        onFeedback(
          message ? { kind: "error", message } : { kind: "ambiguous" },
        );
        reload = false;
      }
    } finally {
      setSubmitting(false);
      inFlight.current = false;
    }
    if (reload) await onSubmitted();
  };

  // Tras un resultado ambiguo: el backend dice si el envío quedó registrado. Si sigue sin poder confirmarse, se
  // mantiene el aviso y las imágenes elegidas; si el envío no llegó, se pueden enviar otra vez.
  const handleCheck = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    try {
      if (await onCheck()) onFeedback({ kind: "none" });
    } finally {
      setChecking(false);
      inFlight.current = false;
    }
  };

  const busy = submitting || checking;
  const ready = picked.front !== null && picked.back !== null;

  return (
    <section
      aria-label={resubmission ? "Reenvía tu INE" : "Verifica tu identidad"}
      className={cardClass}
    >
      <h2 className={titleClass}>
        {resubmission ? "Reenvía tu INE" : "Verifica tu identidad"}
      </h2>
      <p className={labelClass}>
        Para agendar consultas necesitamos verificar tu identidad. Toma o elige
        una foto clara del frente y del reverso de tu INE (JPEG o PNG, máximo 5
        MB cada una).
      </p>

      <div className="grid md:grid-cols-2 gap-4 sm:gap-6 mt-4 sm:mt-6">
        <DocumentSlot
          side="front"
          picked={picked.front}
          disabled={busy}
          onChoose={choose}
        />
        <DocumentSlot
          side="back"
          picked={picked.back}
          disabled={busy}
          onChoose={choose}
        />
      </div>

      {feedback.kind === "error" && (
        <p role="alert" className="text-[#E23A5C] text-[14px] mt-4">
          {feedback.message}
        </p>
      )}
      {feedback.kind === "ambiguous" && (
        <p role="alert" className="text-[#E23A5C] text-[14px] mt-4">
          {AMBIGUOUS_MESSAGE}
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mt-6">
        {feedback.kind === "ambiguous" ? (
          <button
            type="button"
            onClick={handleCheck}
            disabled={busy}
            className={primaryClass}
          >
            {checking ? "Consultando..." : "Consultar estado"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || !ready}
            className={primaryClass}
          >
            {submitting
              ? "Enviando..."
              : resubmission
                ? "Reenviar documentación"
                : "Enviar documentación"}
          </button>
        )}
      </div>
    </section>
  );
}

function DocumentSlot({
  side,
  picked,
  disabled,
  onChoose,
}: {
  side: Side;
  picked: Picked | null;
  disabled: boolean;
  onChoose: (side: Side, file: File | undefined) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Se limpia el campo: el archivo solo queda en el estado de la pantalla.
    event.target.value = "";
    onChoose(side, file);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className={labelClass}>{SIDE_LABEL[side]}</p>
      <div className="w-full aspect-[1.586] bg-white border border-gray-200 rounded-2xl overflow-hidden flex items-center justify-center">
        {picked ? (
          // biome-ignore lint/performance/noImgElement: blob: URL local de un documento privado; next/image no aplica.
          <img
            src={picked.url}
            alt={PREVIEW_LABEL[side]}
            className="object-cover w-full h-full"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-[#999999]">
            <IdCard className="w-10 h-10 text-[#C9BEFB]" strokeWidth={1.5} />
            <span className="text-[14px]">Sin imagen</span>
          </div>
        )}
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        onChange={onChange}
        className="hidden"
        aria-label={`${SIDE_LABEL[side]}: tomar foto`}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png"
        onChange={onChange}
        className="hidden"
        aria-label={`${SIDE_LABEL[side]}: elegir archivo`}
      />
      <div className="flex flex-wrap gap-4">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={disabled}
          className={`${linkButtonClass} inline-flex items-center gap-1`}
        >
          <Camera className="w-4 h-4" aria-hidden="true" />
          Tomar foto
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          className={linkButtonClass}
        >
          {picked ? "Cambiar archivo" : "Elegir archivo"}
        </button>
      </div>
    </div>
  );
}

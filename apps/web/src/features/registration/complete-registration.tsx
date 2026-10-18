"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthShell, btnCls, inputCls } from "@/features/components/auth-shell";
import {
  ApiError,
  acceptLegalDocuments,
  createPatientProfile,
  getCurrentLegalDocuments,
  getRegistrationStatus,
  type LegalDocument,
  type LegalDocumentType,
  pendingRegistrationStep,
  type RegistrationStatus,
} from "@/lib/api";

// Destino cuando el backend confirma que no falta ni el perfil ni la aceptación legal.
export const REGISTRATION_DONE_PATH = "/landing-inicio";

const DOCUMENT_LABELS: Partial<
  Record<LegalDocumentType, { title: string; label: string }>
> = {
  terms_and_conditions: {
    title: "Términos y Condiciones",
    label: "He leído y acepto los Términos y Condiciones",
  },
  patient_terms: {
    title: "Términos y Condiciones",
    label: "He leído y acepto los Términos y Condiciones",
  },
  privacy_notice: {
    title: "Aviso de Privacidad",
    label: "He leído y acepto el Aviso de Privacidad",
  },
  privacy_policy: {
    title: "Aviso de Privacidad",
    label: "He leído y acepto el Aviso de Privacidad",
  },
};

function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "No se pudo completar la operación. Inténtalo de nuevo.";
}

export function CompleteRegistration() {
  const router = useRouter();
  const [status, setStatus] = useState<RegistrationStatus | null>(null);
  const [loadError, setLoadError] = useState("");

  // El estado del registro siempre se pide al backend; el frontend nunca lo marca como completo.
  const refresh = useCallback(async () => {
    setLoadError("");
    try {
      const next = await getRegistrationStatus();
      if (pendingRegistrationStep(next) === null) {
        router.replace(REGISTRATION_DONE_PATH);
        return;
      }
      setStatus(next);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return;
      }
      setLoadError(errorMessage(error));
    }
  }, [router]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loadError)
    return (
      <AuthShell>
        <p role="alert" className="text-[#E23A5C] text-[16px]">
          {loadError}
        </p>
        <button type="button" onClick={refresh} className={`${btnCls} mt-6`}>
          Reintentar
        </button>
      </AuthShell>
    );

  if (!status) return null;

  return (
    <AuthShell>
      <h2 className="text-black text-[26px] sm:text-[40px] font-medium">
        Completa tu registro
      </h2>
      {pendingRegistrationStep(status) === "profile" ? (
        <ProfileStep onDone={refresh} />
      ) : (
        <LegalStep status={status} onDone={refresh} />
      )}
    </AuthShell>
  );
}

function ProfileStep({ onDone }: { onDone: () => Promise<void> }) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    curp: "",
    birthDate: "",
  });
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const set =
    (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [field]: e.target.value });

  const complete = Object.values(form).every((v) => v.trim() !== "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complete || sending) return;
    setSending(true);
    setError("");
    try {
      await createPatientProfile(form);
      await onDone();
    } catch (err) {
      // Un reintento tras una respuesta perdida: el perfil ya existe y basta con releer el estado.
      if (
        err instanceof ApiError &&
        err.error === "ProfileAlreadyExistsError"
      ) {
        await onDone();
        return;
      }
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const field = (
    id: keyof typeof form,
    label: string,
    type = "text",
    hint?: string,
  ) => (
    <div className="mt-6">
      <label htmlFor={id} className="text-black text-[16px] block">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={form[id]}
        onChange={set(id)}
        className={`${inputCls} mt-2`}
      />
      {hint && <p className="text-[#9A9A9A] text-[13px] mt-1">{hint}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate>
      <p className="text-black text-[15px] sm:text-[18px] font-light mt-3">
        Paso 1 de 2: datos de tu perfil de paciente.
      </p>
      {field(
        "firstName",
        "Nombre(s)",
        "text",
        "Tal como aparece en tu identificación oficial.",
      )}
      {field("lastName", "Apellidos")}
      {field("curp", "CURP")}
      {field("birthDate", "Fecha de nacimiento", "date")}
      {error && (
        <p role="alert" className="text-[#E23A5C] text-[14px] mt-4">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!complete || sending}
        className={`${btnCls} mt-8 disabled:opacity-50`}
      >
        {sending ? "Guardando..." : "Continuar"}
      </button>
    </form>
  );
}

function LegalStep({
  status,
  onDone,
}: {
  status: RegistrationStatus;
  onDone: () => Promise<void>;
}) {
  const [documents, setDocuments] = useState<LegalDocument[] | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  // Se muestran solo los documentos vigentes que el backend señala como pendientes: si se publica una
  // versión nueva, vuelve a pedirse únicamente esa.
  const load = useCallback(async () => {
    setLoadError("");
    setChecked({});
    try {
      const current = await getCurrentLegalDocuments();
      const pending = new Set(status.legal.pending.map((p) => p.documentId));
      setDocuments(current.filter((doc) => pending.has(doc.id)));
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError)
    return (
      <div className="mt-6">
        <p role="alert" className="text-[#E23A5C] text-[16px]">
          {loadError}
        </p>
        <button type="button" onClick={load} className={`${btnCls} mt-6`}>
          Reintentar
        </button>
      </div>
    );

  if (!documents) return null;

  // Sin régimen publicado el backend no considera aceptado lo legal y no indica nada pendiente.
  if (documents.length === 0)
    return (
      <p role="alert" className="text-black text-[16px] mt-6">
        Los documentos legales vigentes no están disponibles en este momento,
        así que todavía no puedes completar tu registro. Inténtalo más tarde.
      </p>
    );

  const allChecked = documents.every((doc) => checked[doc.id]);

  const submit = async () => {
    if (!allChecked || sending) return;
    setSending(true);
    setError("");
    try {
      // Aceptar de nuevo un documento ya aceptado no duplica la evidencia en el backend.
      await acceptLegalDocuments(documents.map((doc) => doc.id));
      await onDone();
    } catch (err) {
      setError(errorMessage(err));
      // Una versión que dejó de estar vigente: se recarga el estado para pedir la nueva.
      if (
        err instanceof ApiError &&
        err.error === "LegalDocumentNotCurrentError"
      )
        await onDone();
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <p className="text-black text-[15px] sm:text-[18px] font-light mt-3">
        Paso 2 de 2: lee y acepta los documentos legales vigentes.
      </p>
      {documents.map((doc) => {
        const text = DOCUMENT_LABELS[doc.type] ?? {
          title: doc.type,
          label: `He leído y acepto ${doc.type}`,
        };
        return (
          <div
            key={doc.id}
            className="mt-6 border border-gray-200 rounded-lg p-4"
          >
            <h3 className="text-black text-[18px] font-medium">
              {text.title}{" "}
              <span className="text-[#9A9A9A] text-[14px] font-normal">
                versión {doc.version}
              </span>
            </h3>
            <details className="mt-2">
              <summary className="text-[#664BDB] text-[15px] cursor-pointer">
                Leer {text.title}
              </summary>
              <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-[14px] text-black">
                {doc.content}
              </div>
            </details>
            <label className="flex items-start gap-3 mt-4 text-[15px] text-black">
              <input
                type="checkbox"
                checked={!!checked[doc.id]}
                onChange={(e) =>
                  setChecked({ ...checked, [doc.id]: e.target.checked })
                }
                className="w-[20px] h-[20px] mt-0.5 accent-[#7355F7]"
              />
              {text.label}
            </label>
          </div>
        );
      })}
      {error && (
        <p role="alert" className="text-[#E23A5C] text-[14px] mt-4">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={!allChecked || sending}
        className={`${btnCls} mt-8 disabled:opacity-50`}
      >
        {sending ? "Registrando..." : "Aceptar y continuar"}
      </button>
    </div>
  );
}

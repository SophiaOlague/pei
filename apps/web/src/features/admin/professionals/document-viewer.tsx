"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";

// Tipos que el backend admite (doctors/domain/object-keys.ts): INE JPEG o PNG; cédula PDF, JPEG o PNG.
const IMAGE_TYPES = ["image/jpeg", "image/png"];
const PDF_TYPE = "application/pdf";

export interface PrivateDocument {
  key: string;
  label: string;
  // Descarga autenticada (lib/api.ts: credentials include, no-store). Nunca una URL pública.
  load: () => Promise<Blob>;
  fileName: string;
}

type DocumentState =
  | { kind: "loading" }
  | { kind: "image" | "pdf"; url: string }
  | { kind: "unsupported" }
  | { kind: "error"; message: string; retry: boolean };

function documentError(error: unknown): DocumentState {
  if (error instanceof ApiError) {
    if (error.status === 403)
      return {
        kind: "error",
        message: "Tu cuenta no tiene permiso para ver este documento.",
        retry: false,
      };
    // INE: 409 cuando la revisión ya no está pendiente o no es la vigente (D-19); 404 si no existe.
    if (error.status === 404 || error.status === 409)
      return {
        kind: "error",
        message: "El documento ya no está disponible.",
        retry: false,
      };
    return { kind: "error", message: error.message, retry: true };
  }
  return {
    kind: "error",
    message: "No se pudo cargar el documento. Inténtalo de nuevo.",
    retry: true,
  };
}

// Descarga un documento privado y lo expone como blob: URL local. La URL se libera al cambiar de documento, al
// reintentar y al desmontar; si la descarga termina después, el resultado se descarta sin crear URL.
export function usePrivateDocument(doc: PrivateDocument, attempt: number) {
  const router = useRouter();
  const [state, setState] = useState<DocumentState>({ kind: "loading" });
  const { key, load } = doc;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` identifica el documento; `load` cambia en cada render.
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setState({ kind: "loading" });
    load()
      .then((blob) => {
        if (cancelled) return;
        const type = blob.type.split(";")[0].trim().toLowerCase();
        const kind = IMAGE_TYPES.includes(type)
          ? "image"
          : type === PDF_TYPE
            ? "pdf"
            : null;
        if (!kind) {
          setState({ kind: "unsupported" });
          return;
        }
        url = URL.createObjectURL(blob);
        setState({ kind, url });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/login");
          return;
        }
        setState(documentError(error));
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [key, attempt, router]);

  return state;
}

function DocumentPane({ doc }: { doc: PrivateDocument }) {
  const [attempt, setAttempt] = useState(0);
  const state = usePrivateDocument(doc, attempt);

  if (state.kind === "loading")
    return (
      <output className="block text-[#6B6B6B] text-[15px]">
        Cargando documento…
      </output>
    );
  if (state.kind === "unsupported")
    return (
      <p role="alert" className="text-[#E23A5C] text-[15px]">
        El tipo de archivo recibido no se puede mostrar.
      </p>
    );
  if (state.kind === "error")
    return (
      <div>
        <p role="alert" className="text-[#E23A5C] text-[15px]">
          {state.message}
        </p>
        {state.retry && (
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-3 px-4 py-2 rounded-lg bg-[#664BDB] text-white text-[14px] hover:bg-[#5a3fc4]"
          >
            Reintentar
          </button>
        )}
      </div>
    );
  if (state.kind === "image")
    return (
      // biome-ignore lint/performance/noImgElement: blob: URL local de un documento privado; next/image no aplica.
      <img
        src={state.url}
        alt={doc.label}
        className="max-w-full max-h-[65vh] mx-auto object-contain rounded-lg border border-gray-200"
      />
    );
  // PDF: el backend lo entrega como attachment con CSP sandbox (M03 H.3). No se incrusta en la página, porque un
  // blob: URL tiene el origen de PEI y perdería ese aislamiento; se descarga desde el Blob ya autorizado.
  return (
    <div className="rounded-lg border border-gray-200 bg-[#F7F6FB] p-6 text-center">
      <p className="text-[15px] text-black">Documento PDF</p>
      <p className="text-[13px] text-[#6B6B6B] mt-1">
        Por seguridad, el PDF no se muestra dentro del panel. Descárgalo para
        revisarlo.
      </p>
      <a
        href={state.url}
        download={doc.fileName}
        className="inline-block mt-4 px-4 py-2 rounded-lg bg-[#664BDB] text-white text-[14px] hover:bg-[#5a3fc4]"
      >
        Descargar PDF
      </a>
    </div>
  );
}

// Visor privado. Solo monta el documento elegido: al cambiar de pestaña o cerrar, el anterior libera su blob: URL.
export function DocumentViewer({
  title,
  documents,
  onClose,
}: {
  title: string;
  documents: PrivateDocument[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(documents[0]?.key);
  const doc = documents.find((d) => d.key === selected) ?? documents[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <dialog
        open
        aria-modal="true"
        aria-label={title}
        className="relative bg-white rounded-xl w-full max-w-[900px] max-h-[90vh] overflow-auto p-5 sm:p-6 m-0"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-black text-[18px] font-medium">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar visor"
            className="p-1 rounded hover:bg-gray-100"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {documents.length > 1 && (
          <div className="flex gap-2 mt-4">
            {documents.map((d) => (
              <button
                key={d.key}
                type="button"
                aria-pressed={d.key === doc?.key}
                onClick={() => setSelected(d.key)}
                className={`px-4 py-2 rounded-full text-[14px] border ${
                  d.key === doc?.key
                    ? "bg-[#684DDE] border-[#684DDE] text-white"
                    : "bg-white border-gray-300 text-[#535353]"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}
        <div className="mt-5">
          {doc && <DocumentPane key={doc.key} doc={doc} />}
        </div>
      </dialog>
    </div>
  );
}

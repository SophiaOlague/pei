"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  ApiError,
  type ConsultationPriceVersion,
  getConsultationPrice,
  listConsultationPriceVersions,
  publishConsultationPrice,
} from "@/lib/api";

// M08 (RF-66 propuesto, AP-2, AP-10): precio global de consulta. Un cambio crea una versión nueva con vigencia
// inmediata y no modifica las citas ni los pagos existentes. El backend valida y audita cada publicación.
const PRICE_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;

const money = (price: string, currency: string) =>
  `$${Number(price).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
const date = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    dateStyle: "medium",
    timeStyle: "short",
  });

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403)
      return "Tu cuenta no tiene permiso para administrar el precio.";
    if (error.status === 422)
      return "El precio es igual al vigente; no se creó una versión nueva.";
    return error.message;
  }
  return "No se pudo completar la operación. Inténtalo de nuevo.";
}

export function ConsultationPrice() {
  const router = useRouter();
  const [current, setCurrent] = useState<ConsultationPriceVersion | null>(null);
  const [versions, setVersions] = useState<ConsultationPriceVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await listConsultationPriceVersions();
      setVersions(list);
      try {
        setCurrent(await getConsultationPrice());
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) setCurrent(null);
        else throw e;
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.replace("/login");
        return;
      }
      setLoadError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    const value = draft.trim();
    if (!PRICE_PATTERN.test(value) || Number(value) <= 0) {
      setFormError("Escribe un precio mayor que cero, con hasta 2 decimales.");
      return;
    }
    setFormError(null);
    setConfirming(true);
  };

  const publish = async () => {
    setSaving(true);
    setFormError(null);
    try {
      await publishConsultationPrice(draft.trim());
      setConfirming(false);
      setDraft("");
      setSaved(true);
      await load();
    } catch (e) {
      setConfirming(false);
      setFormError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-[960px]">
      <h1 className="text-black text-[26px] sm:text-[36px] font-medium">
        Precio de consulta
      </h1>
      <p className="text-[#6B6B6B] text-[16px] mt-2">
        Precio global para todas las consultas, sin distinción de médico ni de
        especialidad.
      </p>

      {loading && <p className="mt-8 text-[#6B6B6B]">Cargando…</p>}
      {loadError && (
        <p role="alert" className="mt-8 text-red-700">
          {loadError}
        </p>
      )}

      {!loading && !loadError && (
        <>
          <section
            aria-label="Precio vigente"
            className="bg-white rounded-xl border border-gray-200 p-6 mt-8"
          >
            {current ? (
              <>
                <p className="text-[14px] text-[#6B6B6B]">Precio vigente</p>
                <p className="text-black text-[32px] font-medium">
                  {money(current.price, current.currency)}
                </p>
                <p className="text-[14px] text-[#6B6B6B]">
                  Vigente desde {date(current.effectiveFrom)}
                </p>
              </>
            ) : (
              <p className="text-[#6B6B6B]">
                Aún no hay un precio configurado. Las reservas no estarán
                disponibles hasta que exista uno.
              </p>
            )}
          </section>

          <form
            onSubmit={submit}
            className="bg-white rounded-xl border border-gray-200 p-6 mt-4"
            noValidate
          >
            <label htmlFor="new-price" className="block text-black font-medium">
              Nuevo precio (MXN)
            </label>
            <input
              id="new-price"
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="mt-2 w-full max-w-[240px] border border-gray-300 rounded-lg px-3 py-2"
              placeholder="250.00"
            />
            {formError && (
              <p role="alert" className="mt-2 text-red-700 text-[14px]">
                {formError}
              </p>
            )}
            {saved && (
              <p role="status" className="mt-2 text-green-700 text-[14px]">
                Precio actualizado.
              </p>
            )}
            <button
              type="submit"
              className="mt-4 bg-[#684DDE] text-white rounded-lg px-4 py-2"
            >
              Actualizar precio
            </button>
          </form>

          {confirming && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-title"
              className="bg-white rounded-xl border border-[#684DDE] p-6 mt-4"
            >
              <h2 id="confirm-title" className="text-black font-medium">
                ¿Publicar el nuevo precio de {money(draft.trim(), "MXN")}?
              </h2>
              <p className="text-[14px] text-[#6B6B6B] mt-2">
                Aplica solo a las reservas nuevas, desde este momento. Las citas
                y los pagos existentes no cambian.
              </p>
              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={publish}
                  disabled={saving}
                  className="bg-[#684DDE] text-white rounded-lg px-4 py-2 disabled:opacity-60"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={saving}
                  className="text-[#684DDE] px-4 py-2"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <section aria-label="Historial de precios" className="mt-8">
            <h2 className="text-black text-[18px] font-medium">Historial</h2>
            {versions.length === 0 ? (
              <p className="text-[#6B6B6B] mt-2">Sin versiones.</p>
            ) : (
              <table className="w-full mt-2 bg-white rounded-xl border border-gray-200 text-left text-[14px]">
                <thead>
                  <tr className="text-[#6B6B6B]">
                    <th className="p-3">Precio</th>
                    <th className="p-3">Vigente desde</th>
                    <th className="p-3">Vigente hasta</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.id} className="border-t border-gray-100">
                      <td className="p-3">{money(v.price, v.currency)}</td>
                      <td className="p-3">{date(v.effectiveFrom)}</td>
                      <td className="p-3">
                        {v.effectiveUntil ? date(v.effectiveUntil) : "Vigente"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}

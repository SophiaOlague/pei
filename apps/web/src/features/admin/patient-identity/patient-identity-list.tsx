"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  listPendingPatientIdentityRequests,
  type Page,
  type PatientIdentityRequestItem,
} from "@/lib/api";
import { adminPatientIdentityPath } from "../paths";
import { isUnauthenticated } from "../professionals/admin-errors";
import { formatDate, ReviewBadge } from "../professionals/status";
import { patientIdentityErrorMessage } from "./patient-identity-errors";

export const PAGE_SIZE = 20;

// Cola de solicitudes pendientes (GET /admin/identity-verifications), en orden de llegada. El backend no incluye
// datos del paciente en la cola: se consultan en el detalle de cada solicitud.
export function PatientIdentityList() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<PatientIdentityRequestItem> | null>(
    null,
  );
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setData(null);
    try {
      setData(
        await listPendingPatientIdentityRequests({
          page,
          pageSize: PAGE_SIZE,
        }),
      );
    } catch (e) {
      if (isUnauthenticated(e)) {
        router.replace("/login");
        return;
      }
      setError(patientIdentityErrorMessage(e));
    }
  }, [page, router]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="max-w-[1200px]">
      <h1 className="text-black text-[26px] sm:text-[36px] font-medium">
        Identidad de pacientes
      </h1>
      <p className="text-[#6B6B6B] text-[15px] sm:text-[16px] mt-2">
        Solicitudes de verificación de INE pendientes de revisión, en orden de
        llegada. Un paciente solo puede reservar consultas cuando su identidad
        está aprobada.
      </p>

      <div className="mt-6">
        {error ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <p role="alert" className="text-[#E23A5C] text-[15px]">
              {error}
            </p>
            <button
              type="button"
              onClick={load}
              className="mt-4 px-4 py-2 rounded-lg bg-[#664BDB] text-white text-[14px] hover:bg-[#5a3fc4]"
            >
              Reintentar
            </button>
          </div>
        ) : !data ? (
          <output className="block text-[#6B6B6B] text-[15px]">
            Cargando solicitudes…
          </output>
        ) : data.items.length === 0 ? (
          <p className="bg-white rounded-xl border border-gray-200 p-6 text-[#6B6B6B] text-[15px]">
            No hay solicitudes pendientes.
          </p>
        ) : (
          <>
            <div className="hidden lg:block bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-left text-[14px]">
                <thead className="bg-[#F7F6FB] text-[#6B6B6B]">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Enviada
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Intento
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Estado
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="px-4 py-3 text-[#535353] whitespace-nowrap">
                        {formatDate(r.submittedAt)}
                      </td>
                      <td className="px-4 py-3 text-[#535353]">{r.attempt}</td>
                      <td className="px-4 py-3">
                        <ReviewBadge status="pending" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={adminPatientIdentityPath(r.id)}
                          aria-label={`Revisar la solicitud del ${formatDate(r.submittedAt)}`}
                          className="text-[#4B33B5] font-medium hover:underline"
                        >
                          Revisar
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="lg:hidden space-y-3" aria-label="Solicitudes">
              {data.items.map((r) => (
                <li
                  key={r.id}
                  className="bg-white rounded-xl border border-gray-200 p-4"
                >
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                    <dt className="text-[#89898A]">Enviada</dt>
                    <dd>{formatDate(r.submittedAt)}</dd>
                    <dt className="text-[#89898A]">Intento</dt>
                    <dd>{r.attempt}</dd>
                    <dt className="text-[#89898A]">Estado</dt>
                    <dd>
                      <ReviewBadge status="pending" />
                    </dd>
                  </dl>
                  <Link
                    href={adminPatientIdentityPath(r.id)}
                    aria-label={`Revisar la solicitud del ${formatDate(r.submittedAt)}`}
                    className="inline-block mt-3 text-[#4B33B5] text-[15px] font-medium hover:underline"
                  >
                    Revisar
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {data && data.total > 0 && (
        <nav
          aria-label="Paginación"
          className="flex items-center justify-between gap-4 mt-6 text-[14px]"
        >
          <span className="text-[#6B6B6B]">
            Página {page} de {totalPages} · {data.total}{" "}
            {data.total === 1 ? "solicitud" : "solicitudes"}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
              className="px-4 py-2 rounded-lg border border-gray-300 bg-white disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
              className="px-4 py-2 rounded-lg border border-gray-300 bg-white disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

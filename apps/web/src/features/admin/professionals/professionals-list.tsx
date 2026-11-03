"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  type AdminDoctorItem,
  type DoctorGlobalStatus,
  listAdminDoctors,
  type Page,
} from "@/lib/api";
import { adminDoctorPath } from "../paths";
import { adminErrorMessage, isUnauthenticated } from "./admin-errors";
import {
  AdminStatusBadge,
  LegalBadge,
  LineBadge,
  OperationBadge,
  PendingReasons,
} from "./status";

export const PAGE_SIZE = 20;

// D-38: los filtros consultan ?status= (estado administrativo). Un aprobado con la aceptación legal pendiente sigue
// en «Aprobados»; la aceptación y la habilitación se muestran en columnas aparte.
const FILTERS: { value: DoctorGlobalStatus | undefined; label: string }[] = [
  { value: undefined, label: "Todos" },
  { value: "pending", label: "Pendientes" },
  { value: "approved", label: "Aprobados" },
  { value: "rejected", label: "Rechazados" },
];

const EMPTY_MESSAGES: Record<string, string> = {
  all: "Todavía no hay profesionales registrados.",
  pending: "No hay profesionales pendientes.",
  approved: "No hay profesionales aprobados.",
  rejected: "No hay profesionales rechazados.",
};

const fullName = (d: AdminDoctorItem) => `${d.firstName} ${d.lastName}`;

export function ProfessionalsList() {
  const router = useRouter();
  const [status, setStatus] = useState<DoctorGlobalStatus | undefined>();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AdminDoctorItem> | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setData(null);
    try {
      setData(await listAdminDoctors({ status, page, pageSize: PAGE_SIZE }));
    } catch (e) {
      if (isUnauthenticated(e)) {
        router.replace("/login");
        return;
      }
      setError(adminErrorMessage(e));
    }
  }, [status, page, router]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="max-w-[1200px]">
      <h1 className="text-black text-[26px] sm:text-[36px] font-medium">
        Revisión de profesionales
      </h1>
      <p className="text-[#6B6B6B] text-[15px] sm:text-[16px] mt-2">
        El estado administrativo refleja las revisiones de INE y cédula. La
        aceptación legal y la habilitación se informan por separado.
      </p>

      <fieldset
        aria-label="Filtrar por estado administrativo"
        className="flex flex-wrap gap-2 mt-6"
      >
        {FILTERS.map((f) => {
          const active = f.value === status;
          return (
            <button
              key={f.label}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setStatus(f.value);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-full text-[14px] border transition ${
                active
                  ? "bg-[#684DDE] border-[#684DDE] text-white"
                  : "bg-white border-gray-300 text-[#535353] hover:border-[#684DDE]"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </fieldset>

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
            Cargando profesionales…
          </output>
        ) : data.items.length === 0 ? (
          <p className="bg-white rounded-xl border border-gray-200 p-6 text-[#6B6B6B] text-[15px]">
            {EMPTY_MESSAGES[status ?? "all"]}
          </p>
        ) : (
          <>
            <div className="hidden lg:block bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-left text-[14px]">
                <thead className="bg-[#F7F6FB] text-[#6B6B6B]">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Profesional
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Especialidad
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Identidad
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Cédula
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Estado administrativo
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Aceptación legal
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Habilitación
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((d) => (
                    <tr
                      key={d.doctorProfileId}
                      className="border-t border-gray-100"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={adminDoctorPath(d.doctorProfileId)}
                          className="text-[#4B33B5] font-medium hover:underline"
                        >
                          {fullName(d)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[#535353]">
                        {d.specialty?.name ?? "Sin especialidad"}
                      </td>
                      <td className="px-4 py-3">
                        <LineBadge status={d.identity} />
                      </td>
                      <td className="px-4 py-3">
                        <LineBadge status={d.professional} />
                      </td>
                      <td className="px-4 py-3">
                        <AdminStatusBadge status={d.status} />
                        <PendingReasons status={d} />
                      </td>
                      <td className="px-4 py-3">
                        <LegalBadge accepted={d.legalAccepted} />
                      </td>
                      <td className="px-4 py-3">
                        <OperationBadge canOperate={d.canOperate} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="lg:hidden space-y-3" aria-label="Profesionales">
              {data.items.map((d) => (
                <li
                  key={d.doctorProfileId}
                  className="bg-white rounded-xl border border-gray-200 p-4"
                >
                  <Link
                    href={adminDoctorPath(d.doctorProfileId)}
                    className="text-[#4B33B5] text-[16px] font-medium hover:underline"
                  >
                    {fullName(d)}
                  </Link>
                  <p className="text-[#6B6B6B] text-[14px]">
                    {d.specialty?.name ?? "Sin especialidad"}
                  </p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 text-[13px]">
                    <dt className="text-[#89898A]">Estado administrativo</dt>
                    <dd>
                      <AdminStatusBadge status={d.status} />
                      <PendingReasons status={d} />
                    </dd>
                    <dt className="text-[#89898A]">Identidad</dt>
                    <dd>
                      <LineBadge status={d.identity} />
                    </dd>
                    <dt className="text-[#89898A]">Cédula</dt>
                    <dd>
                      <LineBadge status={d.professional} />
                    </dd>
                    <dt className="text-[#89898A]">Aceptación legal</dt>
                    <dd>
                      <LegalBadge accepted={d.legalAccepted} />
                    </dd>
                    <dt className="text-[#89898A]">Habilitación</dt>
                    <dd>
                      <OperationBadge canOperate={d.canOperate} />
                    </dd>
                  </dl>
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
            {data.total === 1 ? "profesional" : "profesionales"}
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

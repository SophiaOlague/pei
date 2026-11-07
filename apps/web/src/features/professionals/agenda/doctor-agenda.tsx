"use client";

import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  AGENDA_DURATION_OPTIONS,
  AGENDA_MAX_WINDOWS_PER_DAY,
  type AgendaSlots,
  type AgendaWindow,
  ApiError,
  addAgendaTimeOff,
  changeAgendaDuration,
  type DoctorAgenda,
  getAgendaSlots,
  getDoctorAgenda,
  removeAgendaTimeOff,
  replaceAgendaAvailability,
} from "@/lib/api";
import { errorMessage } from "../doctor-sections";
import { PROFESSIONAL_ACCESS_PATH, PROFESSIONAL_PORTAL_PATH } from "../paths";
import {
  formatLocalDay,
  formatMexicoCity,
  mexicoCityDate,
  mexicoCityToIso,
} from "./agenda-time";

// M07 (RF-10, RF-11): agenda del propio médico. Solo un médico habilitado (canOperate) puede modificarla (D-2); los
// demás la consultan en modo de solo lectura. Todas las horas son del centro de México (D-1).
export const WEEKDAYS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const PREVIEW_DAYS = 14;

const fieldCls =
  "h-[42px] px-3 border border-gray-300 rounded-lg text-[15px] text-black focus:outline-none focus:border-[#684DDE] disabled:bg-gray-100";
const primaryCls =
  "h-[42px] px-5 bg-[#664BDB] rounded-lg text-white text-[15px] hover:bg-[#5a3fc4] transition disabled:opacity-50";
const linkCls =
  "text-[#684DDE] text-[14px] hover:underline disabled:opacity-50 disabled:no-underline";

// El selector de hora no admite 24:00: un fin "00:00" significa medianoche al final del día.
export function toApiWindow(w: AgendaWindow): AgendaWindow {
  return w.end === "00:00" ? { ...w, end: "24:00" } : w;
}
const toInputTime = (t: string) => (t === "24:00" ? "00:00" : t);

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 flex flex-col gap-4"
    >
      <h2 className="text-black text-[19px] sm:text-[21px] font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Feedback({ error, done }: { error: string; done: string }) {
  if (error)
    return (
      <p role="alert" className="text-[#E23A5C] text-[14px]">
        {error}
      </p>
    );
  if (done)
    return <output className="block text-[#1E8E5A] text-[14px]">{done}</output>;
  return null;
}

function useAction() {
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>, message: string) => {
    setError("");
    setDone("");
    setBusy(true);
    try {
      await action();
      setDone(message);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return { error, done, busy, run };
}

export function DoctorAgendaPage() {
  const router = useRouter();
  const [agenda, setAgenda] = useState<DoctorAgenda | null>(null);
  const [error, setError] = useState("");
  const [slotsVersion, setSlotsVersion] = useState(0);

  const load = useCallback(async () => {
    setError("");
    try {
      setAgenda(await getDoctorAgenda());
      setSlotsVersion((v) => v + 1);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.replace(PROFESSIONAL_ACCESS_PATH);
        return;
      }
      setError(
        e instanceof ApiError && (e.status === 403 || e.status === 404)
          ? "La agenda está disponible solo para cuentas de médico con perfil registrado."
          : errorMessage(e),
      );
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-[#F7F7FB]">
      <header className="bg-[#2F2A6B] text-white">
        <div className="max-w-[960px] mx-auto px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
          <span className="text-[15px] sm:text-[17px] font-medium">
            Mi agenda
          </span>
          <a
            href={PROFESSIONAL_PORTAL_PATH}
            className="text-[14px] hover:underline"
          >
            Volver al portal
          </a>
        </div>
      </header>
      <main className="max-w-[960px] mx-auto px-4 sm:px-8 py-8 flex flex-col gap-6">
        <p className="text-[#535353] text-[14px]">
          Todos los horarios corresponden a la{" "}
          <strong>hora del centro de México</strong> (Ciudad de México).
        </p>
        {error && (
          <div
            role="alert"
            className="text-[#E23A5C] text-[15px] flex gap-3 items-center"
          >
            {error}
            <button type="button" onClick={load} className={linkCls}>
              Reintentar
            </button>
          </div>
        )}
        {agenda && (
          <>
            {!agenda.canOperate && (
              <p
                role="note"
                className="bg-[#FFF6E5] border border-[#F2C46D] rounded-lg p-4 text-[14px] text-[#6B4E00]"
              >
                Tu registro aún no está habilitado para atender consultas.
                Puedes consultar tu agenda, pero podrás modificarla cuando el
                administrador apruebe tu registro y tengas aceptados los
                documentos legales.
              </p>
            )}
            <WeeklyScheduleSection agenda={agenda} onSaved={load} />
            <DurationSection agenda={agenda} onSaved={load} />
            <TimeOffSection agenda={agenda} onChanged={load} />
            <SlotsPreviewSection version={slotsVersion} />
          </>
        )}
      </main>
    </div>
  );
}

export function WeeklyScheduleSection({
  agenda,
  onSaved,
}: {
  agenda: DoctorAgenda;
  onSaved: () => void;
}) {
  const readOnly = !agenda.canOperate;
  const [windows, setWindows] = useState<AgendaWindow[]>(() =>
    agenda.availability.map((w) => ({ ...w, end: toInputTime(w.end) })),
  );
  const { error, done, busy, run } = useAction();

  const update = (index: number, patch: Partial<AgendaWindow>) =>
    setWindows((all) =>
      all.map((w, i) => (i === index ? { ...w, ...patch } : w)),
    );
  const add = (weekday: number) =>
    setWindows((all) => [...all, { weekday, start: "09:00", end: "13:00" }]);
  const remove = (index: number) =>
    setWindows((all) => all.filter((_, i) => i !== index));

  const save = () =>
    run(async () => {
      await replaceAgendaAvailability(windows.map(toApiWindow));
      onSaved();
    }, "Horario guardado.");

  return (
    <Card title="Horario semanal">
      <p className="text-[#535353] text-[14px]">
        Hasta {AGENDA_MAX_WINDOWS_PER_DAY} franjas por día, sin solaparse. Para
        un horario que cruza la medianoche, termina la franja a las 00:00 y
        agrega otra desde las 00:00 del día siguiente.
      </p>
      <div className="flex flex-col gap-3">
        {DISPLAY_ORDER.map((weekday) => {
          const day = windows
            .map((w, index) => ({ w, index }))
            .filter(({ w }) => w.weekday === weekday);
          return (
            <fieldset
              key={weekday}
              className="flex flex-col gap-2 border-t border-gray-100 pt-3"
            >
              <legend className="text-black text-[15px] font-medium">
                {WEEKDAYS[weekday]}
              </legend>
              {day.length === 0 && (
                <p className="text-[#9A9A9A] text-[14px]">Sin horario</p>
              )}
              {day.map(({ w, index }) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <input
                    type="time"
                    aria-label={`${WEEKDAYS[weekday]}: inicio`}
                    value={w.start}
                    step={300}
                    disabled={readOnly}
                    onChange={(e) => update(index, { start: e.target.value })}
                    className={fieldCls}
                  />
                  <span className="text-[#535353]">a</span>
                  <input
                    type="time"
                    aria-label={`${WEEKDAYS[weekday]}: fin`}
                    value={w.end}
                    step={300}
                    disabled={readOnly}
                    onChange={(e) => update(index, { end: e.target.value })}
                    className={fieldCls}
                  />
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className={linkCls}
                    >
                      Quitar
                    </button>
                  )}
                </div>
              ))}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => add(weekday)}
                  disabled={day.length >= AGENDA_MAX_WINDOWS_PER_DAY}
                  className={`${linkCls} self-start`}
                >
                  Agregar franja ({WEEKDAYS[weekday].toLowerCase()})
                </button>
              )}
            </fieldset>
          );
        })}
      </div>
      <Feedback error={error} done={done} />
      {!readOnly && (
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className={`${primaryCls} self-start`}
        >
          Guardar horario
        </button>
      )}
    </Card>
  );
}

export function DurationSection({
  agenda,
  onSaved,
}: {
  agenda: DoctorAgenda;
  onSaved: () => void;
}) {
  const readOnly = !agenda.canOperate;
  const [minutes, setMinutes] = useState(agenda.durationMinutes);
  const { error, done, busy, run } = useAction();
  const save = () =>
    run(async () => {
      await changeAgendaDuration(minutes);
      onSaved();
    }, "Duración guardada.");

  return (
    <Card title="Duración de la consulta">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="agenda-duration" className="text-[15px] text-black">
          Minutos por consulta
        </label>
        <select
          id="agenda-duration"
          value={minutes}
          disabled={readOnly}
          onChange={(e) => setMinutes(Number(e.target.value))}
          className={fieldCls}
        >
          {AGENDA_DURATION_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
        {!readOnly && (
          <button
            type="button"
            onClick={save}
            disabled={busy || minutes === agenda.durationMinutes}
            className={primaryCls}
          >
            Guardar duración
          </button>
        )}
      </div>
      <Feedback error={error} done={done} />
    </Card>
  );
}

export function TimeOffSection({
  agenda,
  onChanged,
}: {
  agenda: DoctorAgenda;
  onChanged: () => void;
}) {
  const readOnly = !agenda.canOperate;
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const { error, done, busy, run } = useAction();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    run(async () => {
      const start = mexicoCityToIso(startsAt);
      const end = mexicoCityToIso(endsAt);
      if (!start || !end)
        throw new ApiError(400, "Indica la fecha y hora de inicio y de fin.");
      if (end <= start)
        throw new ApiError(400, "El fin debe ser posterior al inicio.");
      await addAgendaTimeOff({
        startsAt: start,
        endsAt: end,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setStartsAt("");
      setEndsAt("");
      setReason("");
      onChanged();
    }, "Periodo agregado.");
  };

  const remove = (id: string) =>
    run(async () => {
      await removeAgendaTimeOff(id);
      onChanged();
    }, "Periodo eliminado.");

  return (
    <Card title="Días libres y ausencias">
      {agenda.timeOff.length === 0 ? (
        <p className="text-[#9A9A9A] text-[14px]">
          No tienes periodos no disponibles próximos.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {agenda.timeOff.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center gap-3 text-[15px] text-black"
            >
              <span>
                {formatMexicoCity(t.startsAt)} – {formatMexicoCity(t.endsAt)}
                {t.reason && (
                  <span className="text-[#535353]"> · {t.reason}</span>
                )}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  disabled={busy}
                  className={linkCls}
                >
                  Eliminar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[14px] text-black">
            Desde
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className={fieldCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-[14px] text-black">
            Hasta
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className={fieldCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-[14px] text-black">
            Motivo (opcional)
            <input
              type="text"
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={fieldCls}
            />
          </label>
          <button type="submit" disabled={busy} className={primaryCls}>
            Agregar periodo
          </button>
        </form>
      )}
      <Feedback error={error} done={done} />
    </Card>
  );
}

export function SlotsPreviewSection({
  version,
  now = () => new Date(),
}: {
  version: number;
  now?: () => Date;
}) {
  const [data, setData] = useState<AgendaSlots | null>(null);
  const [error, setError] = useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: version fuerza la recarga tras cada cambio de la agenda
  useEffect(() => {
    let active = true;
    const today = now();
    getAgendaSlots(
      mexicoCityDate(today),
      mexicoCityDate(today, PREVIEW_DAYS - 1),
    )
      .then((result) => active && setData(result))
      .catch((e) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [version]);

  const byDate = new Map<string, AgendaSlots["slots"]>();
  for (const s of data?.slots ?? [])
    byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);

  return (
    <Card title={`Horarios disponibles (próximos ${PREVIEW_DAYS} días)`}>
      {error && (
        <p role="alert" className="text-[#E23A5C] text-[14px]">
          {error}
        </p>
      )}
      {data && byDate.size === 0 && (
        <p className="text-[#9A9A9A] text-[14px]">
          No hay horarios disponibles en este periodo.
        </p>
      )}
      {data && byDate.size > 0 && (
        <ul className="flex flex-col gap-3">
          {[...byDate].map(([date, slots]) => (
            <li key={date} className="flex flex-col gap-1">
              <span className="text-black text-[15px] font-medium first-letter:uppercase">
                {formatLocalDay(date)}
              </span>
              <span className="text-[#535353] text-[14px]">
                {slots.map((s) => s.start).join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data && (
        <p className="text-[#9A9A9A] text-[13px]">
          Consultas de {data.durationMinutes} minutos.
        </p>
      )}
    </Card>
  );
}

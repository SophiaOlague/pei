import { CalendarCheck, CheckCircle2, Clock, UserCircle } from "lucide-react";
import Link from "next/link";
import { MY_APPOINTMENTS_PATH } from "@/features/booking/paths";
import { formatAppointmentDate } from "@/features/booking/schedule";

// Confirmación después de pagar. Solo se muestra cuando el BACKEND informa la cita confirmada (status confirmed, o el
// pago aprobado con appointmentConfirmed): nunca por lo que diga el navegador o el reto 3-D Secure.

export const HOME_PATH = "/landing-inicio";
export const myAppointmentsPathFor = (appointmentId: string) =>
  `${MY_APPOINTMENTS_PATH}?cita=${encodeURIComponent(appointmentId)}`;

export function PaymentConfirmed({
  appointmentId,
  scheduledAt,
  doctorName,
  amount,
}: {
  appointmentId: string;
  scheduledAt: string;
  doctorName: string | null;
  amount: string | null;
}) {
  const { date, time } = formatAppointmentDate(scheduledAt);
  return (
    <section
      aria-labelledby="pago-confirmado"
      className="mx-auto max-w-xl p-6 flex flex-col items-center text-center gap-5"
    >
      <CheckCircle2
        className="w-16 h-16 text-[#1E8E5A]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <div className="flex flex-col gap-2">
        <h1
          id="pago-confirmado"
          className="text-2xl sm:text-3xl font-semibold text-gray-900"
        >
          ¡Pago exitoso!
        </h1>
        <p className="text-[18px] text-[#1E8E5A] font-medium">
          Tu cita quedó confirmada
        </p>
        {amount && (
          <p className="text-[15px] text-[#535353]">Cobramos {amount}.</p>
        )}
      </div>

      <dl className="w-full bg-[#F4F1FF] rounded-2xl p-5 flex flex-col gap-3 text-left">
        {doctorName && (
          <div className="flex items-center gap-3">
            <UserCircle className="w-6 h-6 text-[#7355F7]" aria-hidden="true" />
            <dt className="sr-only">Médico</dt>
            <dd className="text-[17px] text-black">{doctorName}</dd>
          </div>
        )}
        <div className="flex items-center gap-3">
          <CalendarCheck
            className="w-6 h-6 text-[#7355F7]"
            aria-hidden="true"
          />
          <dt className="sr-only">Fecha</dt>
          <dd className="text-[17px] text-black">{date}</dd>
        </div>
        <div className="flex items-center gap-3">
          <Clock className="w-6 h-6 text-[#7355F7]" aria-hidden="true" />
          <dt className="sr-only">Hora</dt>
          <dd className="text-[17px] text-black">
            {time} (hora del centro de México)
          </dd>
        </div>
      </dl>

      <p className="text-[15px] text-[#535353]">
        Podrás entrar a la sala de espera 15 minutos antes de la hora de tu
        consulta.
      </p>

      <div className="w-full flex flex-col gap-3">
        <Link
          href={myAppointmentsPathFor(appointmentId)}
          className="h-[48px] w-full inline-flex items-center justify-center bg-[#7355F7] rounded-lg text-white text-[17px] hover:bg-[#6244d9] transition"
        >
          Ver mis citas
        </Link>
        <Link
          href={HOME_PATH}
          className="h-[48px] w-full inline-flex items-center justify-center border border-[#7355F7] rounded-lg text-[#7355F7] text-[17px] hover:bg-[#F4F1FF] transition"
        >
          Volver al inicio
        </Link>
      </div>
    </section>
  );
}

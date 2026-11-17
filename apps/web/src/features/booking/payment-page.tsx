import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { PatientNav } from "@/features/components/patient-nav";
import { AppointmentPayment } from "@/features/payments/appointment-payment";
import { MY_APPOINTMENTS_PATH } from "./paths";

// Pantalla de pago del agendamiento: encabezado del paciente alrededor de la integración de F4 (sin cambios). El importe,
// la idempotencia, la sincronización y la confirmación de la cita los resuelven el backend y AppointmentPayment; aquí
// solo se ofrece volver a «Mis citas», donde se ve el estado real de la cita.
export function PaymentPage({ appointmentId }: { appointmentId: string }) {
  return (
    <div className="min-h-screen bg-white">
      <PatientNav />
      <main className="px-4 sm:px-8 max-w-[1100px] mx-auto mt-6 sm:mt-10 pb-16">
        <Link
          href={MY_APPOINTMENTS_PATH}
          className="inline-flex items-center gap-1 text-[16px] text-[#7355F7] hover:underline"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          Ver mis citas
        </Link>
        <AppointmentPayment appointmentId={appointmentId} />
      </main>
    </div>
  );
}

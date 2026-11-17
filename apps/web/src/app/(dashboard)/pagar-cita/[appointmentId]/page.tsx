import { PaymentPage } from "@/features/booking/payment-page";

// F4: pago de una consulta reservada (cita en pending_payment) con Card Payment Brick, dentro del encabezado del
// paciente (PaymentPage no cambia la integración de pago).
export default async function PagarCitaPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const { appointmentId } = await params;
  return <PaymentPage appointmentId={appointmentId} />;
}

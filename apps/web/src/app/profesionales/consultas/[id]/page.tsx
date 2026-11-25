import { ConsultationRoom } from "@/features/professionals/consultations/consultation-room";

export default async function ConsultaProfesionalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ConsultationRoom appointmentId={id} />;
}

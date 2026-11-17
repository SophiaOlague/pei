import { BookingFlow } from "@/features/booking/booking-flow";

// M08: agendamiento real. `?medico=<doctorProfileId>`: médico ya elegido (al volver de la verificación de identidad).
export default async function AgendarCitaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { medico } = await searchParams;
  return (
    <BookingFlow initialDoctorId={typeof medico === "string" ? medico : null} />
  );
}

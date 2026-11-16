import { IdentityVerification } from "@/features/identity-verification/identity-verification";

// RF-07: envío del INE del paciente y estado de su revisión. `?origen=reserva`: se llegó desde el requisito de una
// reserva (el enlace de regreso vuelve a agendar); `medico`: el médico elegido, para volver a él.
export default async function VerificacionIdentidadPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { origen, medico } = await searchParams;
  return (
    <IdentityVerification
      fromBooking={origen === "reserva"}
      bookingDoctorId={typeof medico === "string" ? medico : null}
    />
  );
}

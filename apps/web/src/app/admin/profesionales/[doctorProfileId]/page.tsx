import { DoctorRecord } from "@/features/admin/professionals/doctor-record";

export default async function AdminDoctorPage({
  params,
}: {
  params: Promise<{ doctorProfileId: string }>;
}) {
  const { doctorProfileId } = await params;
  return <DoctorRecord doctorProfileId={doctorProfileId} />;
}

import { PatientIdentityRequest } from "@/features/admin/patient-identity/patient-identity-request";

export default async function AdminPatientIdentityRequestPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  return <PatientIdentityRequest requestId={requestId} />;
}

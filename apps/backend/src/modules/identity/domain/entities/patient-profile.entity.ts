export class PatientProfile {
  constructor(
    public readonly id: string | null,
    public readonly userProfileId: string,
    public readonly curp: string,
  ) {
    if (!curp?.trim()) {
      throw new Error('El CURP es obligatorio para el registro de paciente');
    }
  }
}
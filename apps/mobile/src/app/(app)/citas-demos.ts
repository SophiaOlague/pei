export interface CitaProxima {
  id: string;
  doctorName: string;
  especialidad: string;
  fecha: string;
  hora: string;
  doctorAvatar: string;
  estado: "CONFIRMADA" | "CANCELADA";
  motivoCancelacion?: string;
}

export interface RespuestaCancelacion {
  exito: boolean;
  mensaje: string;
}

let DUMMY_CITAS: CitaProxima[] = [
  {
    id: "cita-1",
    doctorName: "Consulta Dr Josefa Ortiz",
    especialidad: "Análisis de sangre",
    fecha: "20 Noviembre 2026",
    hora: "12:00 hrs",
    doctorAvatar: "",
    estado: "CONFIRMADA",
  },
  {
    id: "cita-2",
    doctorName: "Consulta Dr Marco García",
    especialidad: "Consulta médica",
    fecha: "3 diciembre 2026",
    hora: "13:00 hrs",
    doctorAvatar: "",
    estado: "CONFIRMADA",
  },
];

export const ServiceAgenda = {
  
  async getCitasProximas(): Promise<CitaProxima[]> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return DUMMY_CITAS.filter((c) => c.estado !== "CANCELADA");
  },

  async cancelarCita(citaId: string, motivo?: string): Promise<RespuestaCancelacion> {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const index = DUMMY_CITAS.findIndex((c) => c.id === citaId);
    if (index !== -1) {
      DUMMY_CITAS[index] = {
        ...DUMMY_CITAS[index],
        estado: "CANCELADA",
        motivoCancelacion: motivo || "Sin motivo especificado",
      };
      return {
        exito: true,
        mensaje: `La cita ${citaId} fue cancelada correctamente.`,
      };
    }
    return {
      exito: false,
      mensaje: "No se encontró la cita especificada.",
    };
  },
};
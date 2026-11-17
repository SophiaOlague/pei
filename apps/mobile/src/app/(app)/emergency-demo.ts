export interface EmergencySlot {
  id: string;
  hora: string;
  disponible: boolean;
}

export interface EmergencyAssign {
  doctorId: string;
  doctorName: string;
  especialidad: string;
  fotoUrl: string;
  fecha: string;
  slotAsignado: EmergencySlot;
  horariosLibresDoctor: EmergencySlot[];
}

/**
 * Genera la estructura base de horarios sincronizada a 12 horas AM/PM 
 * aplicando la regla de disponibilidad 2:1 (2 disponibles / 1 bloqueado).
 */
const generarHorariosBase = (): EmergencySlot[] => {
  const slots: EmergencySlot[] = [];
  const horaInicio = 8;
  const horaFin = 17;
  let idCounter = 1;
  let indexCount = 0;

  for (let h = horaInicio; h <= horaFin; h++) {
    for (let m of [0, 30]) {
      if (h === horaFin && m > 0) break;

      const period = h >= 12 ? "PM" : "AM";
      const displayHour = h > 12 ? h - 12 : h;
      const displayMinutes = m === 0 ? "00" : "30";
      const horaFormateada = `${displayHour}:${displayMinutes} ${period}`;

      // 💡 Regla 2:1 -> 2 disponibles (true), 1 bloqueado (false)
      const estaDisponible = indexCount % 3 !== 2;

      slots.push({
        id: `slot-${idCounter++}`,
        hora: horaFormateada,
        disponible: estaDisponible,
      });

      indexCount++;
    }
  }

  return slots;
};

export const ServiceEmergency = {
  /**
   * Obtiene la asignación de emergencia actual y la lista de slots del doctor.
   */
  async getAssignEmergency(): Promise<EmergencyAssign> {
    // 🌐 PRODUCCIÓN / BACKEND REAL:
    // const response = await fetch("https://api.com/emergencia/asignacion");
    // return await response.json();

    // Simulación de latencia de red
    await new Promise((resolve) => setTimeout(resolve, 500));
    const todosLosHorarios = generarHorariosBase();

    return {
      doctorId: "doc-101",
      doctorName: "Dra. Josefa Ortiz",
      especialidad: "Infectóloga",
      fotoUrl: "https://via.placeholder.com/150",
      fecha: "3 de Agosto del 2026",
      slotAsignado: { id: "slot-16", hora: "3:30 PM", disponible: true },
      horariosLibresDoctor: todosLosHorarios,
    };
  },

  /**
   * Actualiza el slot de horario de emergencia en el servidor.
   */
  async updateEmergencySlot(doctorId: string, newSlotId: string): Promise<boolean> {
    // 🌐 PRODUCCIÓN / BACKEND REAL:
    // const response = await fetch("https://tu-api.com/emergencia/reasignar", {
    //   method: "PUT",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({ doctorId, newSlotId }),
    // });
    // return response.ok;

    await new Promise((resolve) => setTimeout(resolve, 300));
    return true;
  },
};
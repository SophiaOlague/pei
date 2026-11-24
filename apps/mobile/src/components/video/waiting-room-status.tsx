import { StyleSheet, Text, View } from "react-native";

import type { VideoSessionState } from "@/lib/api";

// Mensajes de la sala según el estado que devuelve el backend. No decide nada: solo lo explica al paciente.

const CLOSED_MESSAGES: Record<string, string> = {
  completed: "La consulta terminó.",
  no_show_both:
    "La cita se registró como inasistencia de ambas partes. Corresponde el reembolso total de tu pago.",
  no_show_doctor:
    "El médico no se presentó a la consulta. Corresponde el reembolso total de tu pago.",
  no_show_patient: "La cita se registró como inasistencia del paciente.",
};

export function closedMessage(appointmentStatus: string): string {
  return (
    CLOSED_MESSAGES[appointmentStatus] ??
    "Esta cita ya no admite videoconsulta."
  );
}

export function waitingMessage(session: VideoSessionState): string {
  if (session.doctor.busyWithAnotherConsultation) {
    return "El médico está terminando otra consulta. Sigue en la sala: esta espera no cancela tu cita.";
  }
  if (session.doctor.present) {
    return "El médico está en la sala y te admitirá en breve.";
  }
  return "Esperando a que el médico se conecte.";
}

// Casos sin regla en el Maestro: la cita sigue confirmada y nada se cierra automáticamente.
export function pendingMessage(session: VideoSessionState): string | null {
  if (!session.pendingResolution) {
    return null;
  }
  const base =
    "Tu cita sigue confirmada. La plataforma no puede determinar automáticamente el resultado de esta espera: quedó pendiente de revisión.";
  return session.pendingResolution === "late_patient_not_admitted"
    ? `${base} El médico todavía puede admitirte.`
    : base;
}

const minutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));

export function WaitingRoomStatus({
  session,
  connectionLost,
}: {
  session: VideoSessionState;
  connectionLost: boolean;
}) {
  const pending = pendingMessage(session);
  return (
    <View accessibilityLiveRegion="polite" style={styles.panel}>
      {session.phase === "waiting" ? (
        <Text style={styles.title}>Sala de espera</Text>
      ) : null}
      {session.phase === "waiting" ? (
        <Text style={styles.text}>{waitingMessage(session)}</Text>
      ) : null}
      {session.phase === "ended" ? (
        <Text style={styles.text}>
          La consulta terminó.
          {session.durationSeconds === null
            ? ""
            : ` Duración: ${minutes(session.durationSeconds)} min.`}
        </Text>
      ) : null}
      {session.phase === "closed" ? (
        <Text style={styles.text}>
          {closedMessage(session.appointmentStatus)}
        </Text>
      ) : null}
      {pending ? <Text style={styles.text}>{pending}</Text> : null}
      {connectionLost ? (
        <Text accessibilityRole="alert" style={styles.warning}>
          Se perdió la conexión. Reintentando…
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: "#F3F0FF",
    borderRadius: 16,
    gap: 6,
    marginBottom: 20,
    padding: 16,
  },
  text: {
    color: "#111827",
    fontSize: 14,
    lineHeight: 20,
  },
  title: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "600",
  },
  warning: {
    color: "#B91C1C",
    fontSize: 14,
  },
});

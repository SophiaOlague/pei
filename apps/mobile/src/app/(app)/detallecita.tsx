import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  ApiError,
  type BookableDoctor,
  getBookableDoctors,
  getPatientAppointment,
  type PatientAppointment,
} from "@/lib/api";
import { holdActive, statusLabel } from "@/lib/appointment-status";
import {
  formatAppointmentDate,
  formatAppointmentTime,
  waitingRoomAccess,
} from "@/lib/next-appointment";

// Detalle de una cita real (GET /me/patient/appointments/:id). Solo ofrece las acciones que ya existen en la app:
// entrar a la sala de espera de una cita confirmada (desde T0 − 15) o continuar al pago de una retención vigente.

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      appointment: PatientAppointment;
      doctorName: string | null;
    };

const formatMxn = (amount: string) => `$${Number(amount).toFixed(2)} MXN`;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function Actions({
  appointment,
  doctorName,
}: {
  appointment: PatientAppointment;
  doctorName: string | null;
}) {
  const access = waitingRoomAccess(appointment.scheduledAt, new Date());
  const enterRoom = useCallback(() => {
    router.push({
      params: {
        appointmentId: appointment.id,
        ...(doctorName ? { doctorName } : {}),
      },
      pathname: "/joincall",
    });
  }, [appointment.id, doctorName]);
  const pay = useCallback(() => {
    router.push({
      params: { appointmentId: appointment.id },
      pathname: "/pago",
    });
  }, [appointment.id]);

  if (holdActive(appointment)) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={pay}
        style={styles.primary}
      >
        <Text style={styles.primaryText}>Continuar al pago</Text>
      </Pressable>
    );
  }
  if (appointment.status !== "confirmed" || !access) {
    return null;
  }
  if (!access.open) {
    return (
      <Text style={styles.note}>
        Podrás entrar a la sala de espera desde las{" "}
        {formatAppointmentTime(access.opensAt)} h (15 minutos antes de tu
        consulta).
      </Text>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={enterRoom}
      style={styles.primary}
    >
      <Text style={styles.primaryText}>Entrar a la sala</Text>
    </Pressable>
  );
}

export default function AppointmentDetailScreen() {
  const { appointmentId } = useLocalSearchParams<{ appointmentId?: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    if (!appointmentId) {
      setState({ kind: "error", message: "No se indicó la cita." });
      return;
    }
    try {
      const [appointment, doctors] = await Promise.all([
        getPatientAppointment(appointmentId),
        getBookableDoctors().catch((): BookableDoctor[] => []),
      ]);
      const doctor = doctors.find(
        (d) => d.doctorProfileId === appointment.doctorProfileId
      );
      setState({
        appointment,
        doctorName: doctor?.displayName ?? null,
        kind: "ready",
      });
    } catch (e) {
      setState({
        kind: "error",
        message:
          e instanceof ApiError ? e.message : "No se pudo cargar la cita.",
      });
    }
  }, [appointmentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (state.kind === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel="Cargando la cita" />
      </View>
    );
  }
  if (state.kind === "error") {
    return (
      <View style={styles.center}>
        <Text accessibilityRole="alert" style={styles.error}>
          {state.message}
        </Text>
      </View>
    );
  }

  const { appointment, doctorName } = state;
  const at = new Date(appointment.scheduledAt);
  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Detalle de la cita
        </Text>
        <View style={styles.card}>
          <Row label="Médico" value={doctorName ?? "Consulta médica"} />
          <Row label="Fecha" value={formatAppointmentDate(at)} />
          <Row label="Hora" value={`${formatAppointmentTime(at)} h`} />
          <Row label="Motivo" value={appointment.reason} />
          <Row label="Estado" value={statusLabel(appointment.status)} />
          <Row label="Precio" value={formatMxn(appointment.price)} />
        </View>
        <Actions appointment={appointment} doctorName={doctorName} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#F4F1FF", borderRadius: 16, gap: 10, padding: 16 },
  center: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  container: { backgroundColor: "#FFFFFF", flex: 1 },
  content: { gap: 16, padding: 20 },
  error: { color: "#B91C1C", textAlign: "center" },
  label: { color: "#535353", fontSize: 14 },
  note: { color: "#535353", fontSize: 14 },
  primary: {
    alignItems: "center",
    backgroundColor: "#7355F7",
    borderRadius: 8,
    padding: 14,
  },
  primaryText: { color: "#FFFFFF", fontWeight: "700" },
  row: { flexDirection: "row", gap: 12, justifyContent: "space-between" },
  title: { color: "#111827", fontSize: 24, fontWeight: "700" },
  value: { color: "#111827", flexShrink: 1, fontSize: 15, textAlign: "right" },
});

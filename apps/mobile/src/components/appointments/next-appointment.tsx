import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  ApiError,
  type BookableDoctor,
  getBookableDoctors,
  listPatientAppointments,
  type PatientAppointment,
} from "@/lib/api";
import {
  formatAppointmentDate,
  formatAppointmentTime,
  pickNextAppointment,
  WAITING_ROOM_LEAD_MINUTES,
  waitingRoomAccess,
} from "@/lib/next-appointment";

// Próxima cita real del paciente (GET /me/patient/appointments). Sin datos de demostración: si no hay cita, se dice.
// El nombre del médico no viene en la cita; se toma, si está, del catálogo de médicos reservables. Si no está, no se
// muestra ninguno.

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | {
      kind: "ready";
      appointment: PatientAppointment;
      doctorName: string | null;
    };

const NOW_REFRESH_MS = 30_000;

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), NOW_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function ReadyAppointment({
  appointment,
  doctorName,
}: {
  appointment: PatientAppointment;
  doctorName: string | null;
}) {
  const now = useNow();
  const access = waitingRoomAccess(appointment.scheduledAt, now);

  const enterRoom = useCallback(() => {
    router.push({
      params: {
        appointmentId: appointment.id,
        ...(doctorName ? { doctorName } : {}),
      },
      pathname: "/joincall",
    });
  }, [appointment.id, doctorName]);

  if (!access) {
    return (
      <Text accessibilityRole="alert" style={styles.message}>
        No se pudo leer la fecha de tu cita.
      </Text>
    );
  }

  const scheduledAt = new Date(appointment.scheduledAt);
  return (
    <>
      {doctorName ? <Text style={styles.doctorName}>{doctorName}</Text> : null}
      <Text style={styles.date}>
        {formatAppointmentDate(scheduledAt)} ·{" "}
        {formatAppointmentTime(scheduledAt)} h
      </Text>
      {access.open ? null : (
        <Text style={styles.message}>
          Podrás entrar a la sala desde las{" "}
          {formatAppointmentTime(access.opensAt)} h ({WAITING_ROOM_LEAD_MINUTES}{" "}
          minutos antes de tu cita).
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !access.open }}
        disabled={!access.open}
        onPress={enterRoom}
        style={[styles.button, !access.open && styles.buttonDisabled]}
      >
        <Text style={styles.buttonText}>Entrar a la sala</Text>
      </Pressable>
    </>
  );
}

export function NextAppointment() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    latestRequest.current += 1;
    const request = latestRequest.current;
    try {
      const [appointments, doctors] = await Promise.all([
        listPatientAppointments(),
        getBookableDoctors().catch((): BookableDoctor[] => []),
      ]);
      if (request !== latestRequest.current) {
        return;
      }
      const appointment = pickNextAppointment(appointments);
      if (!appointment) {
        setState({ kind: "empty" });
        return;
      }
      const doctor = doctors.find(
        (d) => d.doctorProfileId === appointment.doctorProfileId
      );
      setState({
        appointment,
        doctorName: doctor?.displayName ?? null,
        kind: "ready",
      });
    } catch (e: unknown) {
      if (request !== latestRequest.current) {
        return;
      }
      setState({
        kind: "error",
        message:
          e instanceof ApiError
            ? e.message
            : "No se pudo cargar tu próxima cita.",
      });
    }
  }, []);

  // Se vuelve a consultar cada vez que Inicio recupera el foco (por ejemplo, al volver de pagar una cita).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const retry = useCallback(() => {
    setState({ kind: "loading" });
    load();
  }, [load]);

  const schedule = useCallback(() => {
    router.push("/seleccioncita");
  }, []);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Próxima cita</Text>
      {state.kind === "loading" ? (
        <ActivityIndicator
          accessibilityLabel="Cargando tu próxima cita"
          color="#FFFFFF"
        />
      ) : null}
      {state.kind === "error" ? (
        <>
          <Text accessibilityRole="alert" style={styles.message}>
            {state.message}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={retry}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Reintentar</Text>
          </Pressable>
        </>
      ) : null}
      {state.kind === "empty" ? (
        <>
          <Text style={styles.message}>No tienes citas confirmadas.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={schedule}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Agendar una cita</Text>
          </Pressable>
        </>
      ) : null}
      {state.kind === "ready" ? (
        <ReadyAppointment
          appointment={state.appointment}
          doctorName={state.doctorName}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 50,
    marginTop: 12,
    paddingVertical: 10,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#7355F7",
    fontSize: 14,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#7355F7",
    borderRadius: 16,
    marginBottom: 28,
    padding: 16,
  },
  date: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "500",
  },
  doctorName: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  label: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 12,
  },
  message: {
    color: "#FFFFFF",
    fontSize: 13,
    marginTop: 6,
  },
});

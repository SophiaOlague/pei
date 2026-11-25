import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ApiError,
  type BookableDoctor,
  getBookableDoctors,
  listPatientAppointments,
  type PatientAppointment,
} from "@/lib/api";
import {
  holdActive,
  splitAppointments,
  statusLabel,
} from "@/lib/appointment-status";
import {
  formatAppointmentDate,
  formatAppointmentTime,
} from "@/lib/next-appointment";

// Pestaña «Mis citas» del paciente: sus citas reales (GET /me/patient/appointments) con el estado que informa M08, separadas en
// próximas y pasadas. El nombre del médico no viene en la cita: se toma del catálogo de médicos reservables (si ya no es
// reservable, se muestra sin nombre). `?cita=<id>` resalta una cita (por ejemplo, la recién pagada). Sin datos de
// demostración.

type Tab = "upcoming" | "past";
type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      appointments: PatientAppointment[];
      names: Map<string, string>;
    };

export const appointmentDetailRoute = (appointmentId: string) => ({
  params: { appointmentId },
  pathname: "/detallecita" as const,
});

function AppointmentRow({
  appointment,
  doctorName,
  highlighted,
}: {
  appointment: PatientAppointment;
  doctorName: string | null;
  highlighted: boolean;
}) {
  const at = new Date(appointment.scheduledAt);
  const open = useCallback(
    () => router.push(appointmentDetailRoute(appointment.id)),
    [appointment.id]
  );
  return (
    <Pressable
      accessibilityHint="Abre los detalles de la cita"
      accessibilityLabel={`${doctorName ?? "Consulta médica"}, ${formatAppointmentDate(at)}, ${formatAppointmentTime(at)} h, ${statusLabel(appointment.status)}`}
      accessibilityRole="button"
      accessibilityState={{ selected: highlighted }}
      onPress={open}
      style={[styles.row, highlighted ? styles.rowHighlighted : null]}
    >
      {highlighted ? <Text style={styles.badge}>Recién agendada</Text> : null}
      <Text style={styles.doctor}>{doctorName ?? "Consulta médica"}</Text>
      <Text style={styles.reason}>{appointment.reason}</Text>
      <Text style={styles.when}>
        {formatAppointmentDate(at)} · {formatAppointmentTime(at)} h
      </Text>
      <Text style={styles.status}>{statusLabel(appointment.status)}</Text>
      {holdActive(appointment) ? (
        <Text style={styles.hold}>Pendiente de pago: toca para continuar</Text>
      ) : null}
    </Pressable>
  );
}

function TabButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.tab, selected ? styles.tabSelected : null]}
    >
      <Text style={selected ? styles.tabTextSelected : styles.tabText}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function MyAppointmentsScreen() {
  const { cita } = useLocalSearchParams<{ cita?: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [tab, setTab] = useState<Tab | null>(null);
  const latest = useRef(0);

  const load = useCallback(async () => {
    latest.current += 1;
    const request = latest.current;
    try {
      const [appointments, doctors] = await Promise.all([
        listPatientAppointments(),
        // Solo para mostrar nombres: si falla, las citas se muestran igual.
        getBookableDoctors().catch((): BookableDoctor[] => []),
      ]);
      if (request === latest.current) {
        setState({
          appointments,
          kind: "ready",
          names: new Map(
            doctors.map((d) => [d.doctorProfileId, d.displayName])
          ),
        });
      }
    } catch (e) {
      if (request === latest.current) {
        setState({
          kind: "error",
          message:
            e instanceof ApiError
              ? e.message
              : "No se pudieron cargar tus citas.",
        });
      }
    }
  }, []);

  // Se vuelve a consultar cada vez que la pantalla recupera el foco (por ejemplo, al volver del detalle o de pagar).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const retry = useCallback(() => {
    setState({ kind: "loading" });
    load();
  }, [load]);
  const showUpcoming = useCallback(() => setTab("upcoming"), []);
  const showPast = useCallback(() => setTab("past"), []);
  const schedule = useCallback(() => router.push("/seleccioncita"), []);

  const groups =
    state.kind === "ready"
      ? splitAppointments(state.appointments)
      : { past: [], upcoming: [] };
  // Sin elección del paciente, se abre la pestaña que contiene la cita resaltada (por omisión, las próximas).
  const highlightedInPast = groups.past.some((a) => a.id === cita);
  const current: Tab = tab ?? (highlightedInPast ? "past" : "upcoming");
  const list = current === "upcoming" ? groups.upcoming : groups.past;

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.container}>
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Mis citas
        </Text>
        <View accessibilityRole="tablist" style={styles.tabs}>
          <TabButton
            label={`Próximas (${groups.upcoming.length})`}
            onPress={showUpcoming}
            selected={current === "upcoming"}
          />
          <TabButton
            label={`Pasadas (${groups.past.length})`}
            onPress={showPast}
            selected={current === "past"}
          />
        </View>

        {state.kind === "loading" ? (
          <ActivityIndicator accessibilityLabel="Cargando tus citas" />
        ) : null}
        {state.kind === "error" ? (
          <>
            <Text accessibilityRole="alert" style={styles.error}>
              {state.message}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={retry}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>Reintentar</Text>
            </Pressable>
          </>
        ) : null}
        {state.kind === "ready" && list.length === 0 ? (
          <>
            <Text style={styles.empty}>
              No tienes citas {current === "upcoming" ? "próximas" : "pasadas"}.
            </Text>
            {current === "upcoming" ? (
              <Pressable
                accessibilityRole="button"
                onPress={schedule}
                style={styles.primary}
              >
                <Text style={styles.primaryText}>Agendar una cita</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
        {state.kind === "ready"
          ? list.map((a) => (
              <AppointmentRow
                appointment={a}
                doctorName={state.names.get(a.doctorProfileId) ?? null}
                highlighted={a.id === cita}
                key={a.id}
              />
            ))
          : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#7355F7",
    borderRadius: 999,
    color: "#FFFFFF",
    fontSize: 12,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  container: { backgroundColor: "#FFFFFF", flex: 1 },
  content: { gap: 12, padding: 20 },
  doctor: { color: "#7355F7", fontSize: 18, fontWeight: "600" },
  empty: { color: "#535353", fontSize: 16 },
  error: { color: "#B91C1C" },
  hold: { color: "#8A5A00", fontSize: 13 },
  primary: {
    alignItems: "center",
    backgroundColor: "#7355F7",
    borderRadius: 8,
    padding: 14,
  },
  primaryText: { color: "#FFFFFF", fontWeight: "700" },
  reason: { color: "#111827", fontSize: 15 },
  row: {
    backgroundColor: "#E3DDFD",
    borderRadius: 16,
    gap: 4,
    padding: 16,
  },
  rowHighlighted: { borderColor: "#7355F7", borderWidth: 2 },
  secondary: {
    alignItems: "center",
    borderColor: "#7355F7",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  secondaryText: { color: "#7355F7", fontWeight: "600" },
  status: { color: "#535353", fontSize: 14, fontWeight: "600" },
  tab: {
    backgroundColor: "#E3DDFD",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tabSelected: { backgroundColor: "#7355F7" },
  tabs: { flexDirection: "row", gap: 10 },
  tabText: { color: "#7355F7", fontWeight: "600" },
  tabTextSelected: { color: "#FFFFFF", fontWeight: "600" },
  title: { color: "#111827", fontSize: 26, fontWeight: "700" },
  when: { color: "#535353", fontSize: 14 },
});
